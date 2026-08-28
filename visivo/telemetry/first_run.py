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
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional

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

# The only step this module emits. The rest happen in the browser.
STEP_FIRST_RUN_LAUNCHED = "first_run_launched"

LEDGER_FILENAME = "first_run.json"


def ledger_path() -> Path:
    """Path to the journey ledger, beside ``machine_id`` in ``~/.visivo``."""
    return Path.home() / ".visivo" / LEDGER_FILENAME


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


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
    """Best-effort ledger write. Returns True on success."""
    try:
        path = ledger_path()
        path.parent.mkdir(exist_ok=True)
        with open(path, "w") as ledger_file:
            json.dump(data, ledger_file)
        return True
    except Exception:
        # An unwritable home directory means we lose the journey, not that the
        # server fails to serve a page.
        return False


def get_or_create_journey(project_defaults: Optional[object] = None) -> Optional[Dict[str, Any]]:
    """Return this machine's first-run journey, creating it on first call.

    Returns None when telemetry is disabled — and, critically, writes nothing
    in that case, so an opted-out user never gets a ledger file at all.
    """
    if not is_telemetry_enabled(project_defaults):
        return None

    existing = read_ledger()
    if existing is not None:
        return existing

    journey = {
        "journey_id": str(uuid.uuid4()),
        "started_at_ms": _now_ms(),
        "steps": {},
    }
    _write_ledger(journey)
    return journey


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

    journey = get_or_create_journey(project_defaults)
    if journey is None:
        return False

    steps = journey.get("steps") or {}
    if step_id in steps:
        return False

    now_ms = _now_ms()
    started_at_ms = journey.get("started_at_ms")
    previous_ms = max(steps.values()) if steps else None

    # Claim the step BEFORE tracking. If the PostHog call throws we still do
    # not want a retry storm re-firing the same mark on every page load; the
    # ledger is the once-per-journey guarantee, not the network call.
    steps[step_id] = now_ms
    journey["steps"] = steps
    _write_ledger(journey)

    payload = {
        "journey_id": journey.get("journey_id"),
        "step_id": step_id,
        "step_index": STEP_INDEXES[step_id],
        "ms_since_first_run": (
            max(0, now_ms - started_at_ms) if isinstance(started_at_ms, int) else None
        ),
        "ms_since_previous_step": (
            max(0, now_ms - previous_ms) if isinstance(previous_ms, int) else None
        ),
        "out_of_order": bool(isinstance(previous_ms, int) and now_ms < previous_ms),
        **(properties or {}),
    }

    try:
        from .client import get_telemetry_client
        from .events import FirstRunStepEvent

        client = get_telemetry_client(enabled=True)
        client.track(FirstRunStepEvent.create(step_id=step_id, properties=payload))
    except Exception:
        # Telemetry must never break the server.
        return False
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
    loopback to the person who owns the machine.
    """
    journey = get_or_create_journey(project_defaults)
    if journey is None:
        return None

    machine_id = None
    try:
        from .machine_id import get_machine_id

        machine_id = get_machine_id()
    except Exception:
        machine_id = None

    return {
        "journey_id": journey.get("journey_id"),
        "started_at_ms": journey.get("started_at_ms"),
        "machine_id": machine_id,
        # Steps the CLI has already marked, with their timestamps: the viewer
        # never re-fires a step the server owns, and it can compute
        # `ms_since_previous_step` for its FIRST mark against the real previous
        # mark instead of guessing. A future CLI-side step is honoured without
        # another round of JS changes.
        "steps": dict(journey.get("steps") or {}),
    }
