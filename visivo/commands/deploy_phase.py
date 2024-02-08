import click
import requests
import json
from visivo.commands.utils import get_profile_file, get_profile_token
from visivo.discovery.discover import Discover
from visivo.logging.logger import Logger
from visivo.parsers.serializer import Serializer
from visivo.parsers.parser_factory import ParserFactory


def deploy_phase(working_dir, user_dir, output_dir, stage, host):
    """
    Sends the current version of your project, traces & data to app.visivo.io where it can be viewed by other users on your account. You must specify a stage when deploying a project. The stage allows multiple versions of your project to exist remotely. This is very useful for setting up different dev, CI and production environments.
    """
    profile_token = get_profile_token(get_profile_file(home_directory=user_dir))

    discover = Discover(working_directory=working_dir, home_directory=user_dir)
    parser = ParserFactory().build(
        project_file=discover.project_file, files=discover.files
    )
    project = parser.parse()
    serializer = Serializer(project=project)
    project_json = json.loads(
        serializer.dereference().model_dump_json(exclude_none=True)
    )

    body = {
        "project_json": project_json,
        "name": project_json["name"],
        "cli_version": project_json["cli_version"],
        "stage": stage,
    }
    json_headers = {
        "content-type": "application/json",
        "Authorization": f"Api-Key {profile_token}",
    }
    form_headers = {
        "Authorization": f"Api-Key {profile_token}",
    }

    url = f"{host}/api/projects/"
    response = requests.post(url, data=json.dumps(body), headers=json_headers)
    if response.status_code == 401:
        raise click.ClickException(f"Token not authorized for host: {host}")
    if response.status_code == 404:
        raise click.ClickException(f"404 error raised. Does your user have an account?")
    if response.status_code == 201:
        Logger.instance().debug("Project uploaded")
        project_data = response.json()
        project_id = project_data["id"]
        project_url = project_data["url"]

        for trace in project.trace_objs:
            url = f"{host}/api/files/"

            data_file = f"{output_dir}/{trace.name}/data.json"
            files = {"file": open(data_file, "rb")}
            response = requests.post(url, files=files, data={}, headers=form_headers)
            if response.status_code != 201:
                raise click.ClickException(f"Trace '{trace.name}' data not uploaded")
            Logger.instance().debug(f"Trace '{trace.name}' data uploaded")
            url = f"{host}/api/traces/"
            body = {
                "name": trace.name,
                "project_id": project_id,
                "data_file_id": response.json()["id"],
            }
            response = requests.post(url, data=json.dumps(body), headers=json_headers)
            if response.status_code != 201:
                Logger.instance().debug(response.json())
                raise click.ClickException(f"Trace '{trace.name}' not created")
            Logger.instance().debug(f"Trace '{trace.name}' created")
        return project_url
    else:
        raise click.ClickException(f"There was an unexpected error: {response.content}")
