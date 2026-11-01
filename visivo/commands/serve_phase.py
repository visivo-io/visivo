import webbrowser
from visivo.commands.compile_phase import compile_phase
from visivo.logger.logger import Logger

from visivo.agent.actions import log as action_log
from visivo.server.hot_reload_server import HotReloadServer, project_file_matcher
from visivo.server.flask_app import FlaskApp
from visivo.commands.run_phase import run_phase
from visivo.server.jobs.save_run_executor import record_failed_run
import json
import os
import traceback


def _unbuilt_names(runner):
    """Names of the objects a run failed to build, including ones skipped for a failed dependency."""
    names = (getattr(result.item, "name", None) for result in runner.failed_job_results)
    return {name for name in names if name}


def _retry_filter(project, unbuilt):
    """A selector that rebuilds each unbuilt object still in ``project``, with its dependencies.

    The dependencies are included because an upstream job can succeed with a stale
    result (a model schema of ``*``) that made the downstream job fail.
    """
    dag = project.dag()
    selectors = []
    for name in sorted(unbuilt):
        try:
            dag.get_descendant_by_name(name)
        except ValueError:
            continue
        selectors.append(f"+{name}+")
    return ",".join(selectors)


def serve_phase(
    output_dir,
    working_dir,
    default_source,
    dag_filter,
    threads,
    skip_compile,
    project,
    server_url,
    new=False,
    onboarding=False,
    no_deprecation_warnings=False,
    host=None,
    port=None,
):

    app = FlaskApp(
        output_dir=output_dir,
        project=project,
        working_dir=working_dir,
        host=host,
        port=port,
    )
    server = None  # Will be set later
    unbuilt = set()

    def on_project_change(one_shot=False):
        def emit_project_changed(dropped_drafts):
            if app.hot_reload_server:
                app.hot_reload_server.socketio.emit(
                    "project_changed",
                    {"drafts_dropped": bool(dropped_drafts), "dropped_drafts": dropped_drafts},
                )

        compiled = False
        try:
            Logger.instance().info(
                "Server has detected changes to the project. Re-running project..."
            )
            project = compile_phase(
                default_source=default_source,
                working_dir=working_dir,
                output_dir=output_dir,
                no_deprecation_warnings=no_deprecation_warnings,
            )

            # Drop only the drafts this file edit conflicts with, before the
            # run, so a commit during the run cannot overwrite the edit.
            dropped_drafts = app.drop_stale_drafts(project)
            if dropped_drafts:
                names = ", ".join(f"{d['type']} '{d['name']}'" for d in dropped_drafts)
                Logger.instance().info(
                    f"The project files changed under unsaved drafts. Dropped drafts: {names}."
                )

            changed_dag_filter = project.dag().get_diff_dag_filter(
                existing_project=app.project, existing_dag_filter=dag_filter
            )
            compiled = True
            app.project_error = None
            retry_filter = _retry_filter(project, unbuilt)
            if retry_filter and (changed_dag_filter or not new):
                retried = retry_filter.replace("+", "").replace(",", ", ")
                Logger.instance().info(f"Retrying what did not build in the last run: {retried}")
                changed_dag_filter = ",".join(f for f in (changed_dag_filter, retry_filter) if f)
            if not changed_dag_filter and not new:
                # No runnable jobs changed, but the compiled project may still
                # differ (e.g. a layout-only dashboard edit published to YAML).
                # Refresh the app project so the object managers rehydrate from
                # the new YAML — otherwise a publish that only reshapes a
                # dashboard serves stale published objects until the next data
                # change (the canvas would silently lose the published edit).
                app.project = project
                Logger.instance().info("No data changes to the project. Refreshed metadata.")
                emit_project_changed(dropped_drafts)
                return

            runner = run_phase(
                output_dir=output_dir,
                working_dir=working_dir,
                default_source=default_source,
                dag_filter=changed_dag_filter,
                threads=threads,
                soft_failure=True,
                skip_compile=True,  # Don't recompile on changes, passing in just compiled one.
                project=project,
                server_url=server_url,
                no_deprecation_warnings=no_deprecation_warnings,
            )
            app.project = runner.project
            unbuilt.clear()
            unbuilt.update(_unbuilt_names(runner))
            # The watcher path always rebuilds, whatever the run-trigger
            # preference says — it's the core `visivo serve` contract for editing
            # YAML in a text editor, and it swaps app.project besides. The
            # preference gates the EDITOR's save path only. Since this run did
            # build the changed slice, drop those items from the staged set so
            # the Runs tab doesn't keep asking for work that's already done.
            from visivo.server.jobs.save_run_executor import mark_staged_built

            mark_staged_built(app, changed_dag_filter)
            emit_project_changed(dropped_drafts)
            if one_shot:
                Logger.instance().success("Closing server...")
            else:
                Logger.instance().success("File Change Data Refresh Complete.")
                Logger.instance().info("View your project at: " + server_url)
            with open(f"{output_dir}/error.json", "w") as error_file:
                error_file.write(json.dumps({}))
        except Exception as e:
            error_message = str(e)
            if os.environ.get("STACKTRACE"):
                error_message = f"{str(e)}\n{traceback.format_exc()}"
            Logger.instance().error(error_message)
            if not compiled:
                app.project_error = str(e)
            with open(f"{output_dir}/error.json", "w") as error_file:
                error_file.write(json.dumps({"message": error_message}))

    def on_server_ready(one_shot=False):
        """Run initialization jobs after server starts"""
        try:
            if one_shot:
                Logger.instance().info("Running project build...")
            else:
                Logger.instance().info("Running initial project build...")
            runner = run_phase(
                output_dir=output_dir,
                working_dir=working_dir,
                default_source=default_source,
                dag_filter=dag_filter,
                threads=threads,
                soft_failure=True,
                skip_compile=skip_compile,
                project=project,
                server_url=server_url,
                no_deprecation_warnings=no_deprecation_warnings,
            )
            unbuilt.update(_unbuilt_names(runner))
            if runner.failed_job_results:
                record_failed_run(app, runner)
            if one_shot:
                Logger.instance().info("Closing server...")
            else:
                if not runner.failed_job_results:
                    Logger.instance().success("Initial Data Refresh Complete.")
                Logger.instance().info("View your project at: " + server_url)
                try:
                    if new:
                        open_url = f"{server_url}/?onboarding=1" if onboarding else server_url
                        webbrowser.open(open_url, new=0, autoraise=True)
                except Exception as e:
                    error_message = str(e)
                    if os.environ.get("STACKTRACE"):
                        error_message = f"{str(e)}\n{traceback.format_exc()}"
                    Logger.instance().error(error_message)
        except Exception as e:
            error_message = str(e)
            if os.environ.get("STACKTRACE"):
                error_message = f"{str(e)}\n{traceback.format_exc()}"
            Logger.instance().error(error_message)
            raise

    # Create ignore patterns for dbt files if needed
    ignore_patterns = []
    if project.dbt and project.dbt.enabled:
        dbt_file = project.dbt.get_output_file(output_dir, working_dir)
        if dbt_file:
            ignore_patterns.append(dbt_file)

    # Create and return the hot reload server
    server = HotReloadServer(
        app=app.app,
        on_project_change=on_project_change,
        watch_path=working_dir,
        ignore_patterns=ignore_patterns,
        is_project_file=project_file_matcher(working_dir, output_dir),
    )

    # Pass the server reference to the Flask app so it can control the file watcher
    app.hot_reload_server = server

    # A signal, not the action: the viewer refetches the log, so a dropped
    # emit costs a late update rather than a missing entry.
    action_log().on_record(
        lambda action: app.hot_reload_server
        and app.hot_reload_server.socketio.emit("agent_action", {"id": action["id"]})
    )

    return server, on_project_change, on_server_ready
