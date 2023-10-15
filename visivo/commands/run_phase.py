from visivo.commands.logger import Logger
from visivo.query.runner import Runner
from visivo.models.trace import Trace
from visivo.commands.compile_phase import compile_phase


def run_phase(
    default_target: str,
    output_dir: str,
    working_dir: str,
    trace_filter: str = ".*",
    run_only_changed: bool = False,
):
    project = compile_phase(
        default_target, working_dir=working_dir, output_dir=output_dir
    )

    traces = Trace.filtered(trace_filter, project.descendants_of_type(Trace))

    def changed(trace):
        if not run_only_changed:
            return True
        return trace.changed

    traces = list(filter(changed, traces))

    Logger().info(f"Running project with {len(traces)} traces(s)")
    runner = Runner(
        traces=traces,
        project=project,
        default_target=default_target,
        output_dir=output_dir,
    )
    runner.run()