"""
Time-to-value journey ledger (Guided First Run W1).

Owns the CLI half of an ordered ladder of first-run step marks:

  1. first_run_launched      (here — the local server serving the viewer)
  2. source_connected        (viewer)
  3. first_query_run         (viewer)
  4. first_model_created     (viewer)
  5. first_insight_created   (viewer)
  6. first_dashboard_rendered(viewer, terminal)

``specs/marketing-relaunch/event-taxonomy.md`` §4 is the source of record for
each mark's required properties, its frozen ``step_index``, and the
``from_sample`` filter the gate metric must be read with.

The journey lives in ``~/.visivo/first_run.json`` rather than in memory because
it spans a CLI process, a browser, and every reload in between — the file is
what makes "once per journey" true rather than "once per page load".

The ledger and every payload hold random UUIDs, timestamps, counts, and
booleans: no project / source / dashboard name, no SQL, no path. With telemetry
disabled no ledger is created at all.
"""

import json
import os
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .config import is_telemetry_enabled

# Frozen identities: a step added later takes the next unused integer even when
# it falls mid-journey, because renumbering redefines every historical funnel.
# Steps 2-6 are emitted by viewer/src/components/onboarding/timeToValue.js.
STEP_INDEXES: Dict[str, int] = {
    "first_run_launched": 1,
    "source_connected": 2,
    "first_query_run": 3,
    "first_model_created": 4,
    "first_insight_created": 5,
    "first_dashboard_rendered": 6,
}

STEP_FIRST_RUN_LAUNCHED = "first_run_launched"

LEDGER_FILENAME = "first_run.json"

# `visivo serve` is threaded, so the whole read-modify-write is held: two
# simultaneous index.html requests would otherwise both find a step unclaimed
# and both emit it.
_LEDGER_LOCK = threading.RLock()

_JOURNEY_CACHE: Optional[Tuple[str, Dict[str, Any]]] = None

_SAMPLE_DASHBOARDS_CACHE: Optional[List[str]] = None


def ledger_path() -> Path:
    """Path to the journey ledger, beside ``machine_id`` in ``~/.visivo``."""
    return Path.home() / ".visivo" / LEDGER_FILENAME


def machine_id_path() -> Path:
    """Path to the anonymous machine id file — the install's age is read off it."""
    return Path.home() / ".visivo" / "machine_id"


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def reset_journey_cache() -> None:
    """Drop the per-process journey cache. Test helper; product code never calls it."""
    global _JOURNEY_CACHE
    with _LEDGER_LOCK:
        _JOURNEY_CACHE = None


def _cached_journey() -> Optional[Dict[str, Any]]:
    cached = _JOURNEY_CACHE
    if not cached:
        return None
    path, journey = cached
    if path != str(ledger_path()):
        return None
    return journey


def _remember_journey(journey: Dict[str, Any]) -> None:
    global _JOURNEY_CACHE
    _JOURNEY_CACHE = (str(ledger_path()), journey)


def read_ledger() -> Optional[Dict[str, Any]]:
    """Return the parsed ledger, or None when absent/unreadable/corrupt.

    A corrupt ledger is treated as absent rather than raising: telemetry must
    never be able to break `visivo serve`.
    """
    try:
        path = ledger_path()
        if not path.exists():
            return None
        with open(path, "r") as ledger_file:
            data = json.load(ledger_file)
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    if not isinstance(data.get("journey_id"), str) or not data["journey_id"]:
        return None
    steps = data.get("steps")
    if not isinstance(steps, dict):
        data["steps"] = {}
    return data


def _write_ledger(data: Dict[str, Any]) -> bool:
    """Best-effort atomic ledger write. Returns True on success.

    Temp file plus ``os.replace``: a truncated file reads as absent, and an
    absent ledger mints a second journey that restarts ``ms_since_first_run``.
    """
    tmp_path = None
    try:
        path = ledger_path()
        path.parent.mkdir(exist_ok=True)
        handle, tmp_path = tempfile.mkstemp(
            dir=str(path.parent), prefix=".first_run.", suffix=".tmp"
        )
        with os.fdopen(handle, "w") as ledger_file:
            json.dump(data, ledger_file)
        os.replace(tmp_path, path)
        return True
    except Exception:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
        return False


def _install_age_ms(now_ms: int) -> Optional[int]:
    """How long ``~/.visivo/machine_id`` had existed when the journey started.

    ``None`` when there is no persisted machine id (CI, an unwritable home).
    The ledger's absence cannot separate a genuine first run from an
    established install, because no install has a ledger until this ships; this
    is the property that can.
    """
    try:
        # Resolve the machine id first: on a genuinely new install the file is
        # created by this very request, and should read ~0 rather than unknown.
        _stable_machine_id()
        path = machine_id_path()
        if not path.exists():
            return None
        return max(0, now_ms - int(path.stat().st_mtime * 1000))
    except Exception:
        return None


def _is_interactive_run() -> bool:
    """True when a human is plausibly at a terminal.

    Reuses ``machine_id._is_interactive``, the same backstop that stops a
    container with a fresh ``$HOME`` per cold start from reporting a
    ``new_installation`` on every run. Only *minting* is gated behind it.
    """
    try:
        from .machine_id import _is_interactive

        return _is_interactive()
    except Exception:
        return False


def _stable_machine_id() -> Optional[str]:
    """The same machine id the emitted events ship under.

    ``machine_id.get_machine_id()`` is not idempotent in CI/container contexts —
    it returns a fresh ``ci-<uuid>`` per call and persists nothing — so the join
    goes through ``events._get_machine_id``, the process-wide memo CLI events use.
    """
    try:
        from .events import _get_machine_id

        return _get_machine_id()
    except Exception:
        return None


def bundled_sample_dashboard_names() -> List[str]:
    """Dashboard names shipped in ``visivo/templates/samples``.

    Handed to the viewer so the terminal mark's ``from_sample`` is decided by
    the dashboard being rendered rather than by the onboarding branch taken.
    These are visivo's own names and never enter a payload — only the boolean
    derived from them does.
    """
    global _SAMPLE_DASHBOARDS_CACHE
    if _SAMPLE_DASHBOARDS_CACHE is not None:
        return _SAMPLE_DASHBOARDS_CACHE

    names: List[str] = []
    try:
        import yaml

        samples_root = Path(__file__).resolve().parent.parent / "templates" / "samples"
        for project_file in sorted(samples_root.glob("*/project.visivo.yml")):
            with open(project_file, "r") as sample_file:
                data = yaml.safe_load(sample_file)
            dashboards = (data or {}).get("dashboards") or []
            for dashboard in dashboards:
                if not isinstance(dashboard, dict):
                    continue
                name = dashboard.get("name")
                if isinstance(name, str) and name and name not in names:
                    names.append(name)
    except Exception:
        # A build without the samples directory must not break serving a page.
        names = []

    _SAMPLE_DASHBOARDS_CACHE = sorted(names)
    return _SAMPLE_DASHBOARDS_CACHE


def get_or_create_journey(project_defaults: Optional[object] = None) -> Optional[Dict[str, Any]]:
    """Return this machine's first-run journey, creating it on first call.

    Returns None when telemetry is disabled, writing nothing at all in that
    case, and None when there is no journey yet and the run is not interactive.
    """
    if not is_telemetry_enabled(project_defaults):
        return None

    with _LEDGER_LOCK:
        existing = read_ledger()
        if existing is not None:
            _remember_journey(existing)
            return existing

        # The ledger is gone or unwritable. Reuse this process's journey rather
        # than minting a second one, which would re-fire step 1 on every page
        # load and split the CLI's journey id from the viewer's.
        cached = _cached_journey()
        if cached is not None:
            return cached

        if not _is_interactive_run():
            return None

        now_ms = _now_ms()
        journey = {
            "journey_id": str(uuid.uuid4()),
            "started_at_ms": now_ms,
            "install_age_ms": _install_age_ms(now_ms),
            "steps": {},
        }
        _write_ledger(journey)
        _remember_journey(journey)
        return journey


def _step_payload(
    journey: Dict[str, Any], step_id: str, now_ms: int, previous_ms
) -> Dict[str, Any]:
    started_at_ms = journey.get("started_at_ms")
    install_age_ms = journey.get("install_age_ms")
    return {
        "journey_id": journey.get("journey_id"),
        "step_id": step_id,
        "step_index": STEP_INDEXES[step_id],
        "ms_since_first_run": (
            max(0, now_ms - started_at_ms) if isinstance(started_at_ms, int) else None
        ),
        "ms_since_previous_step": (
            max(0, now_ms - previous_ms) if isinstance(previous_ms, int) else None
        ),
        "install_age_ms": install_age_ms if isinstance(install_age_ms, int) else None,
        "out_of_order": bool(isinstance(previous_ms, int) and now_ms < previous_ms),
    }


def mark_step(
    step_id: str,
    properties: Optional[Dict[str, Any]] = None,
    project_defaults: Optional[object] = None,
) -> bool:
    """Emit a time-to-value step mark, at most once per journey.

    Returns True only when an event was actually tracked; every failure mode —
    disabled telemetry, unknown step, unwritable ledger, a client that raises —
    is swallowed into a False.
    """
    if step_id not in STEP_INDEXES:
        return False
    if not is_telemetry_enabled(project_defaults):
        return False

    # The claim is the once-per-journey guarantee, so it happens under the lock;
    # the network call does not, so a slow PostHog cannot stall a request.
    with _LEDGER_LOCK:
        journey = get_or_create_journey(project_defaults)
        if journey is None:
            return False

        steps = journey.get("steps") or {}
        if step_id in steps:
            return False

        now_ms = _now_ms()
        previous_ms = max(steps.values()) if steps else None

        # Claim before tracking: a throwing PostHog call must not leave the step
        # unclaimed and re-firing on every page load.
        steps[step_id] = now_ms
        journey["steps"] = steps
        _write_ledger(journey)

        payload = {**_step_payload(journey, step_id, now_ms, previous_ms), **(properties or {})}

    try:
        from .client import get_telemetry_client
        from .events import FirstRunStepEvent

        client = get_telemetry_client(enabled=True)
        client.track(FirstRunStepEvent.create(step_id=step_id, properties=payload))
    except Exception:
        # Telemetry must never break the server.
        return False
    return True


def record_viewer_step(
    step_id: str,
    journey_id: Optional[str] = None,
    at_ms: Optional[int] = None,
    project_defaults: Optional[object] = None,
) -> bool:
    """Record a mark the viewer already emitted into the server-side ledger.

    Emits nothing; the browser already sent the event. The viewer's own
    idempotence lives in ``localStorage``, which is scoped to
    ``http://localhost:<port>`` — a second browser or a different serve port
    would re-fire every viewer mark under the same ``journey_id``. This file is
    not origin-scoped, and the next page load seeds the viewer from it.

    Never creates a journey: a mark can only be recorded against the journey
    the server already handed the page.
    """
    if step_id not in STEP_INDEXES:
        return False
    if not is_telemetry_enabled(project_defaults):
        return False

    with _LEDGER_LOCK:
        journey = read_ledger() or _cached_journey()
        if journey is None:
            return False
        if journey_id and journey.get("journey_id") != journey_id:
            return False

        steps = journey.get("steps") or {}
        if step_id in steps:
            return False

        recorded_at = at_ms if isinstance(at_ms, int) and at_ms > 0 else _now_ms()
        steps[step_id] = recorded_at
        journey["steps"] = steps
        _write_ledger(journey)
        _remember_journey(journey)
        return True


def viewer_journey_context(project_defaults: Optional[object] = None) -> Optional[Dict[str, Any]]:
    """The journey handed to the browser so viewer marks join the CLI's.

    Returns None when telemetry is disabled, so the served page carries no
    journey and the viewer has nothing to mark.

    ``machine_id`` is the anonymous random UUID CLI events already ship under;
    carrying it is what joins a viewer-side mark to ``new_installation`` /
    ``cli_command`` in PostHog.
    """
    journey = get_or_create_journey(project_defaults)
    if journey is None:
        return None

    install_age_ms = journey.get("install_age_ms")

    return {
        "journey_id": journey.get("journey_id"),
        "started_at_ms": journey.get("started_at_ms"),
        "install_age_ms": install_age_ms if isinstance(install_age_ms, int) else None,
        "machine_id": _stable_machine_id(),
        # Every mark already claimed, CLI-side or written back through
        # `record_viewer_step`: the viewer skips these, and dates
        # `ms_since_previous_step` for its first mark off the newest of them.
        "steps": dict(journey.get("steps") or {}),
        "sample_dashboards": bundled_sample_dashboard_names(),
    }
