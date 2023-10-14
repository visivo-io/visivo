import click
from visivo.commands.options import output_dir, working_dir, target, trace_filter


@click.command()
@trace_filter
@target
@working_dir
@output_dir
def run(output_dir, working_dir, target, trace_filter):
    """
    Compiles the project and then runs the trace queries to fetch data to populate in the traces. Writes all data to the target directory.
    """
    from halo import Halo

    with Halo(text="Deploying", spinner="dots"):
        from visivo.commands.run_phase import run_phase

        run_phase(
            default_target=target,
            output_dir=output_dir,
            working_dir=working_dir,
            trace_filter=trace_filter,
        )
