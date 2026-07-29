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
    run_now(flask_app, ",".join(f"+{name}+" for name in names))


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
            run_manager.set_state(run_id, RunState.FAILED, logs=logs, error_json={"phase": "run"})
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
            error_json={"phase": "run", "error": str(exc)},
        )


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
