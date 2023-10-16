import click
from .options import output_dir


@click.command()
@output_dir
@click.option(
    "-j", "--json-file", help="The file with the raw json results from the query"
)
def aggregate(output_dir, json_file):
    from visivo.logging.logger import Logger

    Logger.instance().debug("Aggregating")

    from visivo.query.runner import Runner

    Runner.aggregate(trace_dir=output_dir, json_file=json_file)
    Logger.instance().success("Done")
