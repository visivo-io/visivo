import click
from visivo.query.runner import Runner
from visivo.models.trace import Trace
from .compile import compile_phase
from .options import output_dir, working_dir, target, trace_filter


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

    click.echo(f"Running project with {len(traces)} traces(s)")
    runner = Runner(
        traces=traces,
        project=project,
        default_target=default_target,
        output_dir=output_dir,
    )
    runner.run()


@click.command()
@trace_filter
@target
@working_dir
@output_dir
def run(output_dir, working_dir, target, trace_filter):
    """
    Compiles the project and then runs the trace queries to fetch data to populate in the traces. Writes all data to the target directory.
    """
    run_phase(
        default_target=target,
        output_dir=output_dir,
        working_dir=working_dir,
        trace_filter=trace_filter,
    )
