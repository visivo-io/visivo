"""Run-on-save loop for local serve — the local mirror of the cloud's
``request_auto_run``.

Each resource save debounce-triggers a run that rebuilds the changed DAG slice
into the ``main`` target dir from the cached-injected project, capturing the
build output as the run's logs. The viewer's run-poller picks the run up and
soft-refreshes the rendered data on success (``runDataVersion``) — no preview run
and no full page reload.
"""

import threading
from copy import deepcopy

from visivo.constants import DEFAULT_RUN_ID
from visivo.jobs.filtered_runner import FilteredRunner
from visivo.jobs.job import diagnostic_object_ref
from visivo.logger.logger import Logger
from visivo.models.diagnostic import Diagnostic, DiagnosticPhase
from visivo.server.jobs.project_injection import inject_cached_objects
from visivo.server.managers.run_manager import RunState

# Coalesce rapid saves (e.g. one editor action touching several rows) into one run.
_DEBOUNCE_SECONDS = 0.5

# error_json is a polled status payload, not the log channel — cap it. The
# full text stays on GET /api/runs/<run_id>/logs/.
_MAX_DIAGNOSTICS = 50

_pending_names = set()
_pending_lock = threading.Lock()
_pending_timer = None


def request_run(flask_app, names):
    """Record the saved resource name(s) and (re)arm a single debounced run.
    No-op if the app has no run manager (e.g. minimal test harnesses)."""
    global _pending_timer
    if getattr(flask_app, "run_manager", None) is None:
        return
    with _pending_lock:
        _pending_names.update(n for n in names if n)
        if _pending_timer is not None:
            _pending_timer.cancel()
        _pending_timer = threading.Timer(_DEBOUNCE_SECONDS, _fire, args=(flask_app,))
        _pending_timer.daemon = True
        _pending_timer.start()


def _fire(flask_app):
    global _pending_timer
    with _pending_lock:
        names = sorted(_pending_names)
        _pending_names.clear()
        _pending_timer = None
    if not names:
        return
    run_now(flask_app, _dag_filter_for(flask_app, names))


def _dag_filter_for(flask_app, names):
    """The selector this run should build.

    Asks the staged manager rather than deriving one from the saved names,
    because the names alone cannot express a DELETE. Building
    ``+<name>+`` for a resource that was just deleted asks the DAG for a node
    that no longer exists, and the run fails complaining about the very object
    the user removed — which is exactly what it looked like from the outside.

    ``StagedManager.dag_filter`` already encodes the right answer, including
    the empty string (a full rebuild) when anything staged is deleted, since a
    deleted node's consumers have to recompute. Deferring to it also makes the
    debounced run-on-save and the Run button agree, which is what that method
    exists for.

    Falls back to the name-derived selector when the staged manager is absent
    (minimal test harnesses) or has nothing staged. An empty staged set means it
    has no opinion — ``dag_filter`` returns ``""`` for both "nothing staged" and
    "something was deleted", and those must not be conflated: the first should
    build what was asked for, only the second is a full rebuild. In the normal
    path this never comes up, because ``run_on_save`` records the change before
    it requests the run.
    """
    staged_manager = getattr(flask_app, "staged_manager", None)
    if staged_manager is None or not staged_manager.list():
        return ",".join(f"+{name}+" for name in names)
    return staged_manager.dag_filter()


def run_now(flask_app, dag_filter):
    """Start a run for ``dag_filter`` on a background thread and return it.

    The single entry point for both triggers — the debounced run-on-save above
    and the Run button (``POST /api/projects/<id>/run/``) — so a manual run
    behaves identically to an automatic one.
    """
    run = flask_app.run_manager.create(dag_filter)
    thread = threading.Thread(target=_execute, args=(flask_app, run.id, dag_filter), daemon=True)
    thread.start()
    return run


def _execute(flask_app, run_id, dag_filter):
    """Rebuild ``dag_filter`` into ``main`` from the cached-injected project."""
    run_manager = flask_app.run_manager
    run_manager.set_state(run_id, RunState.RUNNING)
    try:
        project = deepcopy(flask_app.project)
        inject_cached_objects(flask_app, project)
        project.invalidate_dag_cache()

        runner = FilteredRunner(
            project=project,
            output_dir=flask_app.output_dir,
            threads=1,
            soft_failure=True,
            dag_filter=dag_filter,
            server_url="",
            # The serve working dir — NOT project.path. Source seed commands and
            # relative `file:` sources resolve their paths against this; the
            # canonical run (run_phase) uses the same.
            working_dir=flask_app._working_dir,
            run_id=DEFAULT_RUN_ID,
        )
        runner.run()

        logs = _format_logs(runner)
        if runner.failed_job_results:
            run_manager.set_state(
                run_id, RunState.FAILED, logs=logs, error_json=_error_json_from(runner)
            )
        else:
            # Record what this run built, so the staged list drops exactly the
            # items it covered. A failure deliberately leaves them staged — the
            # change still needs a run.
            mark_staged_built(flask_app, dag_filter)
            run_manager.set_state(run_id, RunState.SUCCEEDED, logs=logs)
    except Exception as exc:  # compile/validation/etc. — surface as a failed run
        Logger.instance().error(f"save-run {run_id} failed: {exc}")
        run_manager.set_state(
            run_id,
            RunState.FAILED,
            logs=str(exc),
            # `error` stays for older viewers (extractRunError renders it);
            # `diagnostics` is the same failure in the shared contract shape.
            error_json={
                "phase": "run",
                "error": str(exc),
                "diagnostics": [
                    Diagnostic.from_exception(exc, phase=DiagnosticPhase.RUN).model_dump(
                        mode="json", exclude_none=True
                    )
                ],
            },
        )


def _error_json_from(runner):
    """The structured payload for a failed run (W4, Error Legibility).

    ``{'phase': 'run'}`` used to be the ENTIRE payload — the runner's
    failed_job_results were discarded one line after being formatted into the
    logs, so the viewer's per-record failure banner rendered the literal JSON
    envelope. ``diagnostics`` now carries each failed job's Diagnostic
    (additive: ``phase`` stays for consumers that predate the contract).
    """
    diagnostics = []
    for result in runner.failed_job_results:
        if len(diagnostics) >= _MAX_DIAGNOSTICS:
            break
        if result.diagnostic is not None:
            diagnostics.append(result.diagnostic.model_dump(mode="json", exclude_none=True))
        else:
            # Every W3 failure site populates a diagnostic; this belt covers
            # any producer that predates the contract. Never the dot-padded,
            # ANSI-coloured terminal message — point at the logs instead.
            diagnostics.append(
                Diagnostic(
                    phase=DiagnosticPhase.RUN,
                    code="unexpected_error",
                    message=(
                        f"Job for '{getattr(result.item, 'name', 'unknown')}' failed — "
                        f"see the run logs for details."
                    ),
                    object=diagnostic_object_ref(result.item),
                ).model_dump(mode="json", exclude_none=True)
            )
    return {"phase": "run", "diagnostics": diagnostics}


def mark_staged_built(flask_app, dag_filter):
    """Un-stage what a successful run just built.

    An empty ``dag_filter`` is a full rebuild, so everything staged is now built.
    Otherwise take the names back out of the ``+name+`` selector — the same set
    the filter was built from.
    """
    staged_manager = getattr(flask_app, "staged_manager", None)
    if staged_manager is None:
        return
    names = None if not dag_filter else {part.strip("+") for part in dag_filter.split(",")}
    staged_manager.mark_built(names)


def _format_logs(runner):
    """One line per job result (success + failure), in run order."""
    lines = [str(r.message) for r in runner.successful_job_results]
    lines += [str(r.message) for r in runner.failed_job_results]
    return "\n".join(lines)
