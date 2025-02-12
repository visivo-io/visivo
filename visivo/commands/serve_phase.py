from visivo.logging.logger import Logger

from visivo.server.hot_reload_server import HotReloadServer
from visivo.server.flask_app import flask_app
from visivo.commands.run_phase import run_phase
import json
import os
import traceback

    
def serve_phase(
        output_dir, 
        working_dir, 
        default_source, 
        dag_filter, 
        threads, 
        thumbnail_mode, 
        skip_compile, 
        project, 
        server_url
    ):

    app = flask_app(
        output_dir=output_dir,
        dag_filter=dag_filter,
        project=project,
    )

    def on_project_change(one_shot=False):
        try:
            Logger.instance().info("Server has detected changes to the project. Re-running project...")
            run_phase(
                output_dir=output_dir,
                working_dir=working_dir,
                default_source=default_source,
                dag_filter=dag_filter,
                run_only_changed=True,
                threads=threads,
                soft_failure=True,
                thumbnail_mode=thumbnail_mode,
                skip_compile=False,  # Always recompile on changes
                project=None,  # Don't reuse project instance
                server_url=server_url,
            )
            if one_shot:
                Logger.instance().success("Closing server...")
            else:
                Logger.instance().success("File Change Data Refresh Complete.") 
                Logger.instance().info("View your project at: " + server_url)
            with open(f"{output_dir}/error.json", "w") as error_file:
                error_file.write(json.dumps({}))
        except Exception as e:
            error_message = str(e)
            if os.environ.get('STACKTRACE'):
                error_message = f"{str(e)}\n{traceback.format_exc()}"
            Logger.instance().error(error_message)
            with open(f"{output_dir}/error.json", "w") as error_file:
                error_file.write(json.dumps({"message": error_message}))

    def on_server_ready(one_shot=False):
        """Run initialization jobs after server starts"""
        try:
            if one_shot:
                Logger.instance().info("Running project build...")
            else:
                Logger.instance().info("Running initial project build...")
            run_phase(
                output_dir=output_dir,
                working_dir=working_dir,
                default_source=default_source,
                dag_filter=dag_filter,
                threads=threads,
                thumbnail_mode=thumbnail_mode,
                skip_compile=skip_compile,
                project=project,
                server_url=server_url,
            )
            if one_shot:
                Logger.instance().info("Closing server...")
            else:
                Logger.instance().success("Initial Data Refresh Complete.") 
                Logger.instance().info("View your project at: " + server_url)
        except Exception as e:
            error_message = str(e)
            if os.environ.get('STACKTRACE'):
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
        app=app,
        watch_path=working_dir,
        ignore_patterns=ignore_patterns
    )
    
    return server, on_project_change, on_server_ready
