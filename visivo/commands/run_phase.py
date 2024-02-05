from visivo.logging.logger import Logger
from visivo.query.runner import Runner
from visivo.commands.compile_phase import compile_phase


def run_phase(
    default_target: str,
    output_dir: str,
    working_dir: str,
    name_filter: str = None,
    run_only_changed: bool = False,
    threads: int = 8,
    soft_failure=False,
):
    project = compile_phase(
        default_target=default_target,
        working_dir=working_dir,
        output_dir=output_dir,
        name_filter=name_filter,
    )

    def changed(trace):
        if not run_only_changed:
            return True
        return trace.changed

    traces = project.filter_traces(name_filter=name_filter)
    traces = list(filter(changed, traces))

    Logger.instance().info(
        f"Running project with {len(traces)} traces(s) across {threads} threads and default target {default_target}\n"
    )

    runner = Runner(
        traces=traces,
        project=project,
        output_dir=output_dir,
        threads=threads,
        soft_failure=soft_failure,
    )
    runner.run()
    return runner
