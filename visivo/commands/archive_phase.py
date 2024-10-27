from visivo.logging.logger import Logger
import click
import requests
import json
from visivo.commands.utils import get_profile_file, get_profile_token


def archive_phase(stage, host, user_dir):
    profile_token = get_profile_token(get_profile_file(home_dir=user_dir))

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
        Logger.instance().debug(f"No stages with name {stage} found")
        return

    id = response.json()[0]["id"]
    body = {
        "archived": True,
    }
    url = f"{host}/api/stages/{id}/"
    response = requests.put(url, data=json.dumps(body), headers=json_headers)
    if response.status_code == 200:
        Logger.instance().debug("Stage archived")
    else:
        raise click.ClickException(f"There was an unexpected error: {response.content}")
