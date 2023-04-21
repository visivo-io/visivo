import click
import requests
import json
from visivo.discovery.discover import Discover
from visivo.parsers.serializer import Serializer
from visivo.parsers.parser_factory import ParserFactory
from visivo.parsers.core_parser import PROFILE_FILE_NAME
from .options import output_dir, working_dir, user_dir, stage, host


@click.command()
@working_dir
@output_dir
@stage
@host
@user_dir
def deploy(working_dir, user_dir, output_dir, stage, host):
    files = Discover(working_directory=working_dir, home_directory=user_dir).files()
    parser = ParserFactory().build(files=files)
    profile = parser.data_by_name(
        name=PROFILE_FILE_NAME
    )  # Maybe this should be a different command
    if not profile or "token" not in profile:
        raise click.ClickException(
            f"{PROFILE_FILE_NAME} not present or token not present in {PROFILE_FILE_NAME}: {user_dir}"
        )

    project = parser.parse()
    serializer = Serializer(project=project)
    project_json = json.loads(serializer.dereference().json())

    body = {
        "project_json": project_json,
        "name": project_json["name"],
        "stage": stage,
    }
    json_headers = {
        "content-type": "application/json",
        "Authorization": f"Api-Key {profile['token']}",
    }
    form_headers = {
        "Authorization": f"Api-Key {profile['token']}",
    }

    url = f"{host}/api/projects/"
    response = requests.post(url, data=json.dumps(body), headers=json_headers)
    if response.status_code == 401:
        raise click.ClickException(f"Token not authorized for host: {host}")
    if response.status_code == 404:
        raise click.ClickException(f"404 error raised. Does your user have an account?")
    if response.status_code == 201:
        click.echo("Project uploaded")
        project_data = response.json()
        project_id = project_data["id"]

        for trace in project.trace_objs:
            url = f"{host}/api/files/"

            data_file = f"{output_dir}/{trace.name}/data.json"
            files = {"file": open(data_file, "rb")}
            response = requests.post(url, files=files, data={}, headers=form_headers)
            if response.status_code != 201:
                raise click.ClickException(f"Trace '{trace.name}' data not uploaded")
            click.echo(f"Trace '{trace.name}' data uploaded")
            url = f"{host}/api/traces/"
            body = {
                "name": trace.name,
                "project_id": project_id,
                "data_file_id": response.json()["id"],
            }
            response = requests.post(url, data=json.dumps(body), headers=json_headers)
            if response.status_code != 201:
                click.echo(response.json())
                raise click.ClickException(f"Trace '{trace.name}' not created")
            click.echo(f"Trace '{trace.name}' created")
    else:
        raise click.ClickException(f"There was an unexpected error: {response.content}")
