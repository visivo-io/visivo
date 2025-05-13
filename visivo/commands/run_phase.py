from visivo.models.dashboard import Dashboard
from visivo.models.project import Project
import os


def run_phase(
    default_source: str,
    output_dir: str,
    working_dir: str,
    dag_filter: str = None,
    threads: int = None,
    soft_failure: bool = False,
    dbt_profile: str = None,
    dbt_target: str = None,
    thumbnail_mode: str = None,
    skip_compile: bool = False,
    project: Project = None,
    server_url: str = None,
):
    from visivo.logging.logger import Logger
    from visivo.jobs.filtered_runner import FilteredRunner
    from time import time

    if not server_url and thumbnail_mode == "all":
        raise Exception(
            "Thumbnail mode is set to 'all', but no server URL is provided. A running server is required to generate thumbnails."
        )
    # Replace compile phase with parse project phase if skip_compile is True. Injects the project if it's available.
    if project and skip_compile:
        Logger.instance().debug(
            f"Using provided project {project.name}. skip_compile is {skip_compile}"
        )
    elif not project and skip_compile:
        from visivo.commands.parse_project_phase import parse_project_phase

        Logger.instance().info("Parsing project...")
        start_time = time()
        project = parse_project_phase(
            working_dir=working_dir,
            output_dir=output_dir,
            default_source=default_source,
            dbt_profile=dbt_profile,
            dbt_target=dbt_target,
        )
        Logger.instance().info(f"Parsing project took {round(time() - start_time, 2)}s")
    else:
        from visivo.commands.compile_phase import compile_phase

        project = compile_phase(
            default_source=default_source,
            working_dir=working_dir,
            output_dir=output_dir,
            dbt_profile=dbt_profile,
            dbt_target=dbt_target,
        )

    if not dag_filter:
        dag_filter = ",".join(
            map(
                lambda x: f"+{x.name}+",
                project.dag().get_nodes_by_types([Dashboard], True),
            )
        )

    Logger.instance().debug(f"DAG filter: {dag_filter}")
    # Initialize project defaults if not present
    if thumbnail_mode is None and project.defaults and project.defaults.thumbnail_mode:
        thumbnail_mode = project.defaults.thumbnail_mode

    if threads is None and project.defaults and project.defaults.threads:
        threads = project.defaults.threads
    else:
        threads = int(threads)

    source_details = "\n" if default_source == None else f" and default source {default_source}\n"
    Logger.instance().info(f"Running project across {threads} threads" + source_details)

    runner = FilteredRunner(
        project=project,
        output_dir=output_dir,
        threads=threads,
        soft_failure=soft_failure,
        dag_filter=dag_filter,
        thumbnail_mode=thumbnail_mode,
        server_url=server_url,
    )
    runner.run()
    return runner
