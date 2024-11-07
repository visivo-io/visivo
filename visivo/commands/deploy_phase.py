from visivo.models.trace import Trace
import click
import requests
import json
import sys
import asyncio
import aiofiles
import httpx
import contextvars
from time import time
from tenacity import retry, stop_after_attempt, wait_fixed
from visivo.commands.utils import get_profile_file, get_profile_token
from visivo.discovery.discover import Discover
from visivo.logging.logger import Logger
from visivo.parsers.serializer import Serializer
from visivo.parsers.parser_factory import ParserFactory

# Limit concurrent uploads to avoid overloading the API
semaphore = asyncio.Semaphore(50)
attempt = contextvars.ContextVar("attempt")
MAX_ATTEMPTS = 3


@retry(stop=stop_after_attempt(MAX_ATTEMPTS), wait=wait_fixed(2))
async def upload_trace_data(trace, output_dir, form_headers, host, progress):
    """
    Asynchronously uploads trace data files.
    """
    attempt.set(attempt.get(0) + 1)
    async with semaphore:
        try:
            data_file = f"{output_dir}/{trace.name}/data.json"
            async with httpx.AsyncClient(timeout=60) as client:
                async with aiofiles.open(data_file, "rb") as f:
                    files = {
                        "file": (
                            f"{trace.name}.json",
                            await f.read(),
                            "application/json",
                        )
                    }
                    url = f"{host}/api/files/"
                    response = await client.post(url, files=files, headers=form_headers)
                    response.raise_for_status()
                    progress["completed"] += 1
                    Logger.instance().success(
                        f"\tTrace '{trace.name}' data uploaded [{progress['completed']}/{progress['total']}]"
                    )
                    return response.json()["id"]
        except httpx.HTTPStatusError as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] HTTP error while creating trace '{trace.name}': {repr(e)} - Response: {e.response.text}"
            )
            if attempt.get() == MAX_ATTEMPTS:
                progress["failed"].append(f"Data upload for '{trace.name}': {repr(e)}")
            raise
        except Exception as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to upload trace data for '{trace.name}': {repr(e)}"
            )
            if attempt.get() == MAX_ATTEMPTS:
                progress["failed"].append(f"Data upload for '{trace.name}': {repr(e)}")
            raise


@retry(stop=stop_after_attempt(MAX_ATTEMPTS), wait=wait_fixed(2))
async def create_trace_record(
    trace, project_id, data_file_id, json_headers, host, progress
):
    """
    Asynchronously creates a trace record on the server.
    """
    async with semaphore:
        try:
            body = {
                "name": trace.name,
                "project_id": project_id,
                "data_file_id": data_file_id,
            }
            async with httpx.AsyncClient(timeout=60) as client:
                url = f"{host}/api/traces/"
                response = await client.post(url, json=body, headers=json_headers)
                response.raise_for_status()
                progress["completed"] += 1
                Logger.instance().success(
                    f"\tTrace '{trace.name}' created [{progress['completed']}/{progress['total']}]"
                )
        except httpx.HTTPStatusError as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] HTTP error while creating trace '{trace.name}': {repr(e)} - Response: {e.response.text}"
            )
            if attempt.get() == MAX_ATTEMPTS:
                progress["failed"].append(
                    f"Record creation for '{trace.name}': {repr(e)}"
                )
            raise
        except Exception as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to create trace '{trace.name}': {repr(e)}"
            )
            if attempt.get() == MAX_ATTEMPTS:
                progress["failed"].append(
                    f"Record creation for '{trace.name}': {repr(e)}"
                )
            raise


async def process_traces_async(
    traces, output_dir, project_id, form_headers, json_headers, host
):
    """
    Coordinates the asynchronous upload of trace data files and the creation of trace records.
    """
    total_operations = (
        len(traces) * 2
    )  # Each trace has a data upload and record creation
    progress = {"completed": 0, "total": total_operations, "failed": []}

    tasks = []
    for trace in traces:
        # Upload data files concurrently
        data_file_task = upload_trace_data(
            trace, output_dir, form_headers, host, progress
        )
        tasks.append(data_file_task)

    # Wait for all data uploads to complete and gather results
    data_file_ids = await asyncio.gather(*tasks, return_exceptions=True)

    # Prepare to create trace records based on successful uploads
    record_tasks = []
    for trace, data_file_id in zip(traces, data_file_ids):
        if isinstance(data_file_id, Exception):
            Logger.instance().error(
                f"\tSkipping trace '{trace.name}' due to previous error uploading data."
            )
            continue
        record_task = create_trace_record(
            trace, project_id, data_file_id, json_headers, host, progress
        )
        record_tasks.append(record_task)

    # Execute the creation of trace records concurrently
    await asyncio.gather(*record_tasks, return_exceptions=True)

    return progress["failed"]


def deploy_phase(working_dir, user_dir, output_dir, stage, host):
    """
    Synchronous function to manage the deployment, including initiating asynchronous operations.
    """
    deploy_start_time = time()
    # Retrieve profile token for authentication
    Logger.instance().debug("Retrieving profile token...")
    profile_file = get_profile_file(home_dir=user_dir)
    profile_token = get_profile_token(profile_file)
    Logger.instance().info(f"Found Profile token: {profile_file}")

    # Discover and parse project details
    Logger.instance().info("")
    Logger.instance().debug("Compiling project details...")
    discover = Discover(
        working_dir=working_dir, home_dir=user_dir, output_dir=output_dir
    )
    parser = ParserFactory().build(
        project_file=discover.project_file, files=discover.files
    )
    project = parser.parse()
    serializer = Serializer(project=project)
    project_json = json.loads(
        serializer.dereference().model_dump_json(exclude_none=True, by_alias=True)
    )
    Logger.instance().success(
        f"Project Compiled in {time() - deploy_start_time:.2f} seconds"
    )

    # Prepare request payloads and headers
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

    # Upload the project information (synchronous)
    Logger.instance().debug("Uploading project information...")
    upload_project_start_time = time()
    url = f"{host}/api/projects/"
    response = requests.post(url, data=json.dumps(body), headers=json_headers)
    if response.status_code == 401:
        raise click.ClickException(f"Token not authorized for host: {host}")
    if response.status_code == 404:
        raise click.ClickException(f"404 error raised. Does your user have an account?")
    if response.status_code == 201:
        Logger.instance().success(
            f"Project uploaded in {time() - upload_project_start_time:.2f} seconds"
        )
        project_data = response.json()
        project_id = project_data["id"]
        project_url = project_data["url"]

        # Async processing of trace uploads and record creations
        Logger.instance().info(f"")
        Logger.instance().info("Processing trace uploads and record creations...")
        process_traces_start_time = time()

        traces = project.descendants_of_type(type=Trace)
        failed_operations = asyncio.run(
            process_traces_async(
                traces=traces,
                output_dir=output_dir,
                project_id=project_id,
                form_headers=form_headers,
                json_headers=json_headers,
                host=host,
            )
        )
        Logger.instance().info(
            f"Trace uploads and record creations completed in {time() - process_traces_start_time:.2f} seconds"
        )

        if failed_operations:
            Logger.instance().info("")
            Logger.instance().info("The following operations failed:")
            for failure in failed_operations:
                Logger.instance().error(f"\t{failure}")
            Logger.instance().info("")
            Logger.instance().info(
                f"Deployment failed in {time() - deploy_start_time:.2f} seconds"
            )
            sys.exit(1)
        Logger.instance().success(
            f"Deployment completed in {time() - deploy_start_time:.2f} seconds"
        )
        return project_url
    else:
        Logger.instance().info(
            f"Deployment failed in {time() - deploy_start_time:.2f} seconds"
        )
        raise click.ClickException(f"There was an unexpected error: {response.content}")
