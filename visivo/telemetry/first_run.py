"""
Time-to-value journey ledger (Guided First Run W1).

The 2.1 exit gate is "8 of 8 new users build a dashboard in under 20 minutes
with zero hand-written YAML". Nothing in the product could measure that, so
this module owns the *start* of the ladder that makes it measurable:

  1. first_run_launched      (here — the local server serving the viewer)
  2. source_connected        (viewer)
  3. first_query_run         (viewer)
  4. first_model_created     (viewer)
  5. first_insight_created   (viewer)
  6. first_dashboard_rendered(viewer, terminal)

The contract for every one of those marks — required properties, the frozen
``step_index``, the ``from_sample`` filter the gate metric MUST be read with —
lives in ``specs/marketing-relaunch/event-taxonomy.md`` §4 and is the source of
record. This module implements steps that live on the CLI side of it.

Why a file rather than in-memory state: the journey spans processes (a CLI that
starts the server) and page reloads (a viewer the user navigates around for
half an hour). ``~/.visivo/first_run.json`` sits beside ``machine_id``, holds a
random ``journey_id`` plus the timestamps of the marks already emitted, and is
what makes "exactly once per journey" true rather than "once per page load".

Three things the ledger has to get right, each of which is a way the gate
metric silently reads zero if it doesn't:

  ONE IDENTITY PER PROCESS. Every caller resolves the journey through
  ``get_or_create_journey``, and the resolved journey is cached per ledger path.
  Without the cache an unwritable ``$HOME`` (a read-only container, a user with
  no writable home) mints a FRESH journey on every call — so ``first_run_launched``
  re-fires on every page load AND the ``journey_id`` handed to the browser never
  matches the one the CLI emitted, leaving the two halves of the span unjoinable.

  A FIRST RUN, NOT AN UPGRADE. A journey is only *minted* on an interactive run
  (the same backstop ``machine_id._is_interactive`` gives ``new_installation``),
  and every mark carries ``install_age_ms`` — how long ``~/.visivo/machine_id``
  had existed when the journey started. A machine that has had visivo installed
  for weeks reaching ``first_dashboard_rendered`` two seconds after ``visivo
  serve`` is an upgrade opening an existing dashboard, not a 2-second
  time-to-value, and the gate metric has to be able to exclude it.

  THE VIEWER'S MARKS COUNT TOO. ``record_viewer_step`` writes a mark the browser
  already emitted back into this ledger. The viewer's own idempotence lives in
  ``localStorage``, which is scoped to one origin — a different serve port, a
  second browser, or a cleared site-data would otherwise re-fire every viewer
  mark under the same ``journey_id``. The file is not origin-scoped.

Privacy posture, matching the rest of visivo.telemetry:

  - ``journey_id`` is a random UUID. It identifies a *first run*, not a person,
    and is derived from nothing about the user or their machine.
  - No user-authored string ever enters a payload here — no project name, no
    path, no source name. Counts and booleans only.
  - When telemetry is disabled the ledger is never even created. An opted-out
    user leaves no new file behind, which is a stronger guarantee than "we
    write it but don't send it".
"""

import json
import os
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from .config import is_telemetry_enabled

# Frozen step identities. See the taxonomy doc: these integers are assigned
# once and never reassigned — a step added later takes the next unused integer
# even when it falls mid-journey chronologically, because renumbering silently
# redefines every historical funnel. Steps 2-6 are emitted by the viewer
# (viewer/src/components/onboarding/timeToValue.js); they are listed here so
# there is one place to read the ladder, and so the two sides cannot drift.
STEP_INDEXES: Dict[str, int] = {
    "first_run_launched": 1,
    "source_connected": 2,
    "first_query_run": 3,
    "first_model_created": 4,
    "first_insight_created": 5,
    "first_dashboard_rendered": 6,
}

# The only step this module *emits*. The rest happen in the browser (and are
# written back here by `record_viewer_step` so the file stays the one authority
# on what has already fired).
STEP_FIRST_RUN_LAUNCHED = "first_run_launched"

LEDGER_FILENAME = "first_run.json"

# One lock for the whole read-modify-write. `visivo serve` is threaded, so two
# simultaneous index.html requests (two tabs opened at once, a reload racing a
# hot-reload navigation) would otherwise both find a step unclaimed and both
# emit it — exactly the double-count the once-per-journey contract forbids.
_LEDGER_LOCK = threading.RLock()

# (ledger path, journey) — see "ONE IDENTITY PER PROCESS" above. Keyed by path
# so a test (or anything else) that repoints $HOME cannot pick up a stale
# journey from a previous home.
_JOURNEY_CACHE: Optional[Any] = None

# Dashboard names shipped in visivo/templates/samples. Read once per process.
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
    """Best-effort ATOMIC ledger write. Returns True on success.

    Written to a sibling temp file and ``os.replace``d into position: a crash,
    a full disk, or a kill mid-write would otherwise leave a truncated file,
    which ``read_ledger`` reports as absent — and an absent ledger mints a
    SECOND journey whose ``ms_since_first_run`` restarts from zero, splitting
    one first run across two ids.
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
        # An unwritable home directory means we lose the journey, not that the
        # server fails to serve a page.
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
        return False


def _install_age_ms(now_ms: int) -> Optional[int]:
    """How long ``~/.visivo/machine_id`` had existed when the journey started.

    ``None`` when there is no persisted machine id (CI, an unwritable home).
    This is the property that separates a genuine first run from an established
    install that merely upgraded into this telemetry: the ledger's absence
    cannot tell them apart, because NO install has a ledger until this ships.
    See the gate-metric note in the taxonomy §4.

    Resolves the machine id first so a genuinely new install — where `visivo
    serve` is the very first command and the file is created in this same
    request — reports ~0 rather than the "unknown" a missing file would mean.
    """
    try:
        _stable_machine_id()
        path = machine_id_path()
        if not path.exists():
            return None
        return max(0, now_ms - int(path.stat().st_mtime * 1000))
    except Exception:
        return None


def _is_interactive_run() -> bool:
    """True when a human is plausibly at a terminal.

    Reuses ``machine_id._is_interactive`` — the same universal backstop that
    stops containers/serverless with a fresh ``$HOME`` per cold start from
    reporting a spurious ``new_installation`` on every run. A journey is only
    *minted* behind it; an existing journey keeps marking regardless, so a user
    who started interactively is still measured from a detached follow-up run.
    """
    try:
        from .machine_id import _is_interactive

        return _is_interactive()
    except Exception:
        return False


def _stable_machine_id() -> Optional[str]:
    """The SAME machine id the emitted events ship under.

    ``machine_id.get_machine_id()`` is not idempotent in CI/container contexts —
    it returns a fresh ``ci-<uuid>`` on every call and persists nothing — so
    calling it directly here would hand the browser a machine id that differs
    from the one on ``first_run_launched`` and rotates on every page load,
    silently breaking the CLI↔viewer join this whole ladder is built on.
    ``events._get_machine_id`` is the process-wide memo every CLI event uses.
    """
    try:
        from .events import _get_machine_id

        return _get_machine_id()
    except Exception:
        return None


def bundled_sample_dashboard_names() -> List[str]:
    """Dashboard names shipped in ``visivo/templates/samples``.

    Handed to the viewer so the terminal mark's ``from_sample`` is decided by
    the dashboard actually being rendered rather than by which onboarding
    branch the user happened to take. The onboarding path is written once and
    never updated, so it is wrong in both directions: a user who skipped
    onboarding and opened the bundled example reported ``from_sample: false``
    (the TTV-5 trap, a ~1s render landing in the gate metric), and a user who
    took the sample tour and then built a real dashboard 40 minutes later
    reported ``from_sample: true`` and was filtered OUT of it.

    These are visivo's own names, not user-authored strings, and they never
    enter an event payload — only the boolean derived from them does.
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

    Returns None when telemetry is disabled — and, critically, writes nothing
    in that case, so an opted-out user never gets a ledger file at all. Also
    returns None when there is no journey yet and the run is not interactive:
    a container or CI runner with a fresh ``$HOME`` per cold start would
    otherwise mint a brand-new "first run" on every start.
    """
    if not is_telemetry_enabled(project_defaults):
        return None

    with _LEDGER_LOCK:
        existing = read_ledger()
        if existing is not None:
            _remember_journey(existing)
            return existing

        # The ledger is gone or unwritable. If this process already resolved a
        # journey, keep it: minting a second one here is what re-fires step 1
        # on every page load and splits the CLI's id from the viewer's.
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

    Returns True only when an event was actually tracked, so callers (and
    tests) can distinguish "fired" from "already fired" and from "opted out".
    Every failure mode — disabled telemetry, unknown step, unwritable ledger,
    a PostHog client that raises — is swallowed into a False.
    """
    if step_id not in STEP_INDEXES:
        return False
    if not is_telemetry_enabled(project_defaults):
        return False

    # The claim is the whole once-per-journey guarantee, so it happens under the
    # lock; the network call does not, so a slow PostHog cannot stall a request.
    with _LEDGER_LOCK:
        journey = get_or_create_journey(project_defaults)
        if journey is None:
            return False

        steps = journey.get("steps") or {}
        if step_id in steps:
            return False

        now_ms = _now_ms()
        previous_ms = max(steps.values()) if steps else None

        # Claim the step BEFORE tracking. If the PostHog call throws we still do
        # not want a retry storm re-firing the same mark on every page load; the
        # ledger is the once-per-journey guarantee, not the network call.
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
    """Record a mark the VIEWER already emitted into the server-side ledger.

    Emits nothing — the browser has already sent the event. This exists so
    "once per journey" survives leaving the browser origin the mark was made
    in: ``localStorage`` is scoped to ``http://localhost:<port>``, so a second
    browser, an incognito window, a cleared site-data, or simply ``visivo serve
    -p 8001`` would otherwise re-fire every viewer mark under the same
    ``journey_id`` and inflate the funnel. The file is not origin-scoped, and
    the next page load seeds the viewer from it.

    Never CREATES a journey: a mark can only be recorded against the journey
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
            # A mark from a different journey (a stale tab pointed at a home
            # that has since been cleared) is not this journey's business.
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
    journey and the viewer has nothing to mark — the opt-out needs no second
    implementation on the JS side.

    ``machine_id`` is the existing anonymous CLI identifier (a random UUID in
    ``~/.visivo/machine_id``); including it is what lets a viewer-side mark be
    joined to ``new_installation`` / ``cli_command`` in PostHog. It is already
    the distinct_id every CLI event ships under, and the page is served over
    loopback to the person who owns the machine. It is read through the same
    process-wide memo the events use — see ``_stable_machine_id``.
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
        # Steps the CLI has already marked, with their timestamps: the viewer
        # never re-fires a step the server owns, and it can compute
        # `ms_since_previous_step` for its FIRST mark against the real previous
        # mark instead of guessing. A future CLI-side step is honoured without
        # another round of JS changes. Viewer marks written back through
        # `record_viewer_step` come back down this same channel, which is what
        # dedupes them across browser origins.
        "steps": dict(journey.get("steps") or {}),
        # Lets the terminal mark decide `from_sample` from the dashboard being
        # rendered rather than from the onboarding branch the user took.
        "sample_dashboards": bundled_sample_dashboard_names(),
    }
