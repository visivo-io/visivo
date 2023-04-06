import click
from visivo.models.target import Target, TypeEnum

# from tests.support.utils import create_file_database


@click.command()
def init():
    target = Target(database="target/local.db", type=TypeEnum.sqlite)
    # create_file_database(target.url(), "target")
