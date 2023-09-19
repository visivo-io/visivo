import click
import requests
import json
from visivo.commands.utils import get_profile_file, get_profile_token
from visivo.discovery.discover import Discover
from visivo.parsers.parser_factory import ParserFactory
from .options import user_dir, stage, host


@click.command()
@stage
@host
@user_dir
def archive(stage, host, user_dir):
    """
    Archives a stage.  You must specify a stage when deploying a project.
    """
    profile_token = get_profile_token(get_profile_file(home_directory=user_dir))

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

    id = response.json()[0]["id"]
    body = {
        "archived": True,
    }
    url = f"{host}/api/stages/{id}/"
    response = requests.put(url, data=json.dumps(body), headers=json_headers)
    if response.status_code == 200:
        click.echo("Stage archived")
    else:
        raise click.ClickException(f"There was an unexpected error: {response.content}")
