import click
from .options import output_dir


@click.command()
@output_dir
@click.option(
    "-j", "--json-file", help="The file with the raw json results from the query"
)
def aggregate(output_dir, json_file):
    from visivo.query.runner import Runner

    click.echo("Aggregating data by cohorts")
    Runner.aggregate(trace_dir=output_dir, json_file=json_file)
