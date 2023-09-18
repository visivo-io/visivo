import click
import requests
import json
from visivo.commands.utils import get_profile_token
from visivo.discovery.discover import Discover
from visivo.parsers.parser_factory import ParserFactory
from .options import working_dir, user_dir, stage, host


@click.command()
@stage
@host
def archive(stage, host):
    """
    Archives a stage.  You must specify a stage when deploying a project.
    """
    discover = Discover(working_directory=working_dir, home_directory=user_dir)
    parser = ParserFactory().build(
        project_file=discover.project_file, files=discover.files
    )
    profile_token = get_profile_token(parser)

    
    json_headers = {
        "content-type": "application/json",
        "Authorization": f"Api-Key {profile_token}",
    }

    url = f"{host}/api/stages/?name={stage}"
    response = requests.get(url, headers=json_headers)
    if response.status_code == 401:
        raise click.ClickException(f"Token not authorized for host: {host}")
    if response.status_code == 404:
        raise click.ClickException(f"404 error raised. Does your user have an account?")

    if len(response.json()) == 0:
        click.echo(f"No stages with name {stage} found")
        return

    id = response.json[0]["id"]
    body = {
        "archived": True,
    }
    url = f"{host}/api/stages/{id}"
    response = requests.put(url, data=json.dumps(body), headers=json_headers)
    if response.status_code == 201:
        click.echo("Stage archived")
    else:
        raise click.ClickException(f"There was an unexpected error: {response.content}")
