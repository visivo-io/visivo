import click
from .options import output_dir, working_dir, target


@click.command()
@target
@working_dir
@output_dir
def compile(working_dir, output_dir, target):
    """
    Parses the files in your working directory, extracting visivo configurations and then using those configurations to build the trace queries and a project.json file in your target directory. Queries are not run on compile, just written.
    """
    from halo import Halo

    with Halo(text="Loading", spinner="dots"):
        from visivo.commands.compile_phase import compile_phase

        compile_phase(
            default_target=target, working_dir=working_dir, output_dir=output_dir
        )
