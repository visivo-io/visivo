def run_phase(
    default_source: str,
    output_dir: str,
    working_dir: str,
    name_filter: str = None,
    run_only_changed: bool = False,
    threads: int = None,
    soft_failure=False,
    dbt_profile: str = None,
    dbt_target: str = None,
):
    from visivo.logging.logger import Logger
    from visivo.query.runner import Runner
    from visivo.commands.compile_phase import compile_phase

    project = compile_phase(
        default_source=default_source,
        working_dir=working_dir,
        output_dir=output_dir,
        name_filter=name_filter,
        dbt_profile=dbt_profile,
        dbt_target=dbt_target,
    )
    if threads is None and project.defaults and project.defaults.threads:
        threads = project.defaults.threads
    elif threads is None:
        threads = 8
    else:
        threads = int(threads)

    source_details = (
        "\n" if default_source == None else f" and default source {default_source}\n"
    )
    Logger.instance().info(f"Running project across {threads} threads" + source_details)

    runner = Runner(
        project=project,
        output_dir=output_dir,
        threads=threads,
        soft_failure=soft_failure,
        run_only_changed=run_only_changed,
        name_filter=name_filter,
    )
    runner.run()
    return runner
