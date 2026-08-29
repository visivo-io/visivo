from visivo.models.dashboard import Dashboard
from visivo.models.project import Project
from visivo.constants import DEFAULT_RUN_ID


def _collect_run_telemetry(project, dag_filter):
    """Collect telemetry metrics during run phase."""
    try:
        from visivo.telemetry.command_tracker import track_run_metrics

        track_run_metrics(project, dag_filter)
    except Exception:
        # Silently ignore any telemetry errors
        pass


def run_phase(
    default_source: str,
    output_dir: str,
    working_dir: str,
    dag_filter: str = None,
    threads: int = None,
    soft_failure: bool = False,
    dbt_profile: str = None,
    dbt_target: str = None,
    skip_compile: bool = False,
    project: Project = None,
    server_url: str = None,
    no_deprecation_warnings: bool = False,
    run_id: str = DEFAULT_RUN_ID,
    defer_exit: bool = False,
):
    """
    ``defer_exit`` hands failure reporting back to the caller instead of ending
    the process inside the runner. Used by ``visivo run --json``, which has to
    print its JSON envelope before the process ends; the returned runner's
    ``failed_job_results`` then says whether the run actually succeeded, and the
    caller picks the exit code.

    It works by running soft: ``DagRunner`` calls ``sys.exit(1)`` on a failed job
    unless ``soft_failure`` is set, and that exit unwinds ``FilteredRunner.run()``
    before it can aggregate the per-job results the JSON envelope reports. Two
    consequences worth knowing: every filtered DAG is attempted rather than
    stopping at the first failing one (so ``--json`` reports every broken object
    in one pass), and the ``SystemExit`` guard below is belt-and-braces for any
    other code path that decides to exit mid-run.
    """
    from visivo.logger.logger import Logger
    from visivo.jobs.filtered_runner import FilteredRunner
    from time import time

    # Replace compile phase with parse project phase if skip_compile is True.
    # Injects the project if it's available.
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
            no_deprecation_warnings=no_deprecation_warnings,
        )

    if not dag_filter or dag_filter == "":
        dag_filter = ",".join(
            map(
                lambda x: f"+{x.name}+",
                project.dag().get_nodes_by_types([Dashboard], True),
            )
        )

    Logger.instance().debug(f"DAG filter: {dag_filter}")
    # Initialize project defaults if not present
    if threads is not None:
        threads = int(threads)
    elif project.defaults and project.defaults.threads:
        threads = project.defaults.threads
    else:
        threads = 8

    source_details = "\n" if default_source == None else f" and default source {default_source}\n"
    Logger.instance().info(f"Running project across {threads} threads" + source_details)

    # Count jobs for telemetry
    _collect_run_telemetry(project, dag_filter)

    runner = FilteredRunner(
        project=project,
        output_dir=output_dir,
        threads=threads,
        soft_failure=soft_failure or defer_exit,
        dag_filter=dag_filter,
        server_url=server_url,
        working_dir=working_dir,
        run_id=run_id,
    )
    if defer_exit:
        try:
            runner.run()
        except SystemExit:
            pass
    else:
        runner.run()
    return runner
