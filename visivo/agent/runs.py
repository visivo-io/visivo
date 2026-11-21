"""Whether the project builds, as something the agent can ask.

The tools are read-only: starting a run executes SQL and can spawn a source's
seed subprocesses (VIS-1340), so no model-chosen call may start one. The loop
itself builds at the end of a turn that wrote something, with ``build``.
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
    while True:
        runs = manager.list(limit=1)
        if not runs or runs[0].get("state") not in active:
            return True
        if time.time() >= deadline:
            return False
        time.sleep(_POLL_SECONDS)


def unbuilt(app):
    """Names of the staged changes no run has built, or None when the host cannot say."""
    staged_manager = getattr(app, "staged_manager", None)
    if staged_manager is not None:
        return sorted({item["name"] for item in staged_manager.list()})
    staged = getattr(getattr(app, "run_manager", None), "staged", None)
    return sorted(set(staged())) if staged else None


def _start(app):
    staged_manager = getattr(app, "staged_manager", None)
    if staged_manager is not None:
        from visivo.server.jobs.save_run_executor import cancel_pending_run, run_now

        cancel_pending_run([item["name"] for item in staged_manager.list()])
        run_now(app, staged_manager.dag_filter())
        return
    app.run_manager.start()


def build(app, timeout=RUN_SETTLE_TIMEOUT_SECONDS):
    """Build what is staged and say how it went, whatever the run trigger is.

    A run already in flight may cover the changes, so it is waited for first.
    """
    if getattr(app, "run_manager", None) is None:
        return None
    wait_for_runs(app, timeout=timeout)
    if unbuilt(app):
        _start(app)
    return verdict(app, timeout=timeout)


def _not_built(names, settled):
    return {
        "settled": settled,
        "ok": False,
        "unbuilt": names,
        "note": (
            "These changes have not been built, so nobody knows yet whether they work: "
            + ", ".join(names)
        ),
    }


def verdict(app, timeout=RUN_SETTLE_TIMEOUT_SECONDS):
    """Whether the newest run settled and succeeded, and why not if it did not."""
    manager = getattr(app, "run_manager", None)
    if manager is None:
        return {"settled": True, "ok": True, "state": None, "runs": 0}

    settled = wait_for_runs(app, timeout=timeout)
    listed = manager.list(limit=1)
    if not listed:
        pending = unbuilt(app)
        if pending:
            return {**_not_built(pending, settled), "state": None, "runs": 0}
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
            "Still building. The changes may yet be fine; "
            "check again rather than reporting a failure."
        )
        return result
    if state == "succeeded":
        pending = unbuilt(app)
        if pending:
            result.update(_not_built(pending, settled))
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
