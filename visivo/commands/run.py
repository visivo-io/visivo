import click
from visivo.query.runner import Runner
from visivo.models.target import Target
from .compile import compile_phase, find_or_create_target
from .options import output_dir, working_dir, target, trace_filter


def run_phase(
    target_or_name: str,
    output_dir: str,
    working_dir: str,
    trace_filter: str = ".*",
    run_only_changed: bool = False,
):
    project = compile_phase(
        target_or_name, working_dir=working_dir, output_dir=output_dir
    )
    traces = project.filter_traces(trace_filter)

    def changed(trace):
        if not run_only_changed:
            return True
        return trace.changed

    traces = list(filter(changed, traces))

    click.echo(f"Running project with {len(traces)} traces")
    target = find_or_create_target(project=project, target_or_name=target_or_name)
    runner = Runner(traces=traces, target=target, output_dir=output_dir)
    runner.run()


@click.command()
@trace_filter
@target
@working_dir
@output_dir
def run(output_dir, working_dir, target, trace_filter):
    run_phase(
        target_or_name=target,
        output_dir=output_dir,
        working_dir=working_dir,
        trace_filter=trace_filter,
    )
