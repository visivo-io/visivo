from visivo.logging.logger import Logger
from visivo.query.runner import Runner
from visivo.commands.compile_phase import compile_phase


def run_phase(
    default_target: str,
    output_dir: str,
    working_dir: str,
    name_filter: str = None,
    run_only_changed: bool = False,
):
    project = compile_phase(
        default_target, working_dir=working_dir, output_dir=output_dir, name_filter=name_filter
    )

    def changed(trace):
        if not run_only_changed:
            return True
        return trace.changed

    traces = project.filter_traces(name_filter=name_filter)
    traces = list(filter(changed, traces))

    Logger.instance().debug(f"Running project with {len(traces)} traces(s)")
    runner = Runner(
        traces=traces,
        project=project,
        default_target=default_target,
        output_dir=output_dir,
    )
    runner.run()
