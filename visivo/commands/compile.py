import click
from .options import output_dir, working_dir, target, name_filter


@click.command()
@target
@working_dir
@output_dir
@name_filter
def compile(working_dir, output_dir, target, name_filter):
    """
    Parses the files in your working directory, extracting visivo configurations and then using those configurations to build the trace queries and a project.json file in your target directory. Queries are not run on compile, just written.
    """
    from visivo.logging.logger import Logger

    Logger.instance().debug("Compiling")

    from visivo.commands.compile_phase import compile_phase

    compile_phase(default_target=target, working_dir=working_dir, output_dir=output_dir, name_filter=name_filter)
    Logger.instance().success("Done")
