import click
from visivo.query.aggregator import Aggregator
from visivo.commands.options import output_dir


@click.command()
@output_dir
@click.option("-j", "--json-file", help="The file with the raw json results from the query")
def aggregate(output_dir, json_file):
    """Aggregates raw trace query results from a json file into cohort-grouped data.json files (legacy 1.x trace pipeline)."""
    from visivo.logger.logger import Logger

    Logger.instance().info("Aggregating")

    Aggregator.aggregate(trace_dir=output_dir, json_file=json_file)
    Logger.instance().success("Done")
