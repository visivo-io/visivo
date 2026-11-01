"""Whether the project builds, as something the agent can ask.

A write that changes data starts a build, and until that build finishes nobody
knows whether what was authored works. The agent used to have no way to find
out: the run is debounced and then runs on a background thread, so asking
immediately after a write only ever reports ``queued``, and there is no sleep
tool to wait with.

Read-only on purpose. Starting a run executes SQL and can spawn a source's seed
subprocesses, which VIS-1340 identified as an escalation path.
"""

import time

# A model's SQL against a cold warehouse is the slow case. Long enough for one,
# short enough that a wedged build does not hold the turn open.
RUN_SETTLE_TIMEOUT_SECONDS = 90

_POLL_SECONDS = 0.5

# The whole build output, of which an agent needs the end: a failure explains
# itself there, and the successes above it are noise.
LOG_TAIL = 4000


def _active_states():
    from visivo.server.managers.run_manager import ACTIVE_STATES

    return [state.value for state in ACTIVE_STATES]


def wait_for_runs(app, timeout=RUN_SETTLE_TIMEOUT_SECONDS):
    """Block while a run is in flight.

    Returns whether it settled. A timeout is not an error — a slow build is
    still a build, and the caller decides what to make of it.
    """
    manager = getattr(app, "run_manager", None)
    if manager is None:
        return True

    active = _active_states()
    deadline = time.time() + timeout
    while time.time() < deadline:
        runs = manager.list(limit=1)
        if not runs or runs[0].get("state") not in active:
            return True
        time.sleep(_POLL_SECONDS)
    return False


def verdict(app, timeout=RUN_SETTLE_TIMEOUT_SECONDS):
    """Whether the newest run settled and succeeded, and why not if it did not."""
    manager = getattr(app, "run_manager", None)
    if manager is None:
        return {"settled": True, "ok": True, "state": None, "runs": 0}

    settled = wait_for_runs(app, timeout=timeout)
    listed = manager.list(limit=1)
    if not listed:
        return {"settled": settled, "ok": True, "state": None, "runs": 0}

    latest = listed[0]
    state = latest.get("state")
    result = {
        "settled": settled,
        "ok": bool(settled and state == "succeeded"),
        "state": state,
        "run_id": latest.get("id"),
    }
    if not settled:
        result["note"] = (
            f"Still building after {timeout}s. The changes may yet be fine; "
            "check again rather than reporting a failure."
        )
        return result
    if state == "succeeded":
        return result

    error = latest.get("error_json") or {}
    diagnostics = error.get("diagnostics")
    if diagnostics:
        result["diagnostics"] = diagnostics
    elif error:
        result["error"] = error
    run = manager.get(latest.get("id"))
    logs = getattr(run, "logs", "") or "" if run is not None else ""
    if logs:
        result["logs"] = logs[-LOG_TAIL:]
        result["logs_truncated"] = len(logs) > LOG_TAIL
    return result
