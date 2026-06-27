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
from visivo.logger.logger import Logger
from visivo.server.jobs.project_injection import inject_cached_objects
from visivo.server.managers.run_manager import RunState

# Coalesce rapid saves (e.g. one editor action touching several rows) into one run.
_DEBOUNCE_SECONDS = 0.5

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
    dag_filter = ",".join(f"+{name}+" for name in names)
    run = flask_app.run_manager.create(dag_filter)
    thread = threading.Thread(
        target=_execute, args=(flask_app, run.id, dag_filter), daemon=True
    )
    thread.start()


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
            working_dir=project.path or "",
            run_id=DEFAULT_RUN_ID,
        )
        runner.run()

        logs = _format_logs(runner)
        if runner.failed_job_results:
            run_manager.set_state(
                run_id, RunState.FAILED, logs=logs, error_json={"phase": "run"}
            )
        else:
            run_manager.set_state(run_id, RunState.SUCCEEDED, logs=logs)
    except Exception as exc:  # compile/validation/etc. — surface as a failed run
        Logger.instance().error(f"save-run {run_id} failed: {exc}")
        run_manager.set_state(
            run_id,
            RunState.FAILED,
            logs=str(exc),
            error_json={"phase": "run", "error": str(exc)},
        )


def _format_logs(runner):
    """One line per job result (success + failure), in run order."""
    lines = [str(r.message) for r in runner.successful_job_results]
    lines += [str(r.message) for r in runner.failed_job_results]
    return "\n".join(lines)
