from visivo.models.trace import Trace
import click
import requests
import math
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
semaphore_3 = asyncio.Semaphore(3)
semaphore_50 = asyncio.Semaphore(50)
attempt = contextvars.ContextVar("attempt")
MAX_ATTEMPTS = 3


@retry(stop=stop_after_attempt(MAX_ATTEMPTS), wait=wait_fixed(2))
async def create_trace_files(batch, form_headers, host, progress):
    """
    Asynchronously uploads trace data files.
    """
    files = list(map(lambda trace: {"filename": f"{trace.name}.json"}, batch))
    url = f"{host}/api/files/direct/start/"
    attempt.set(attempt.get(0) + 1)
    async with semaphore_3:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(url, json=files, headers=form_headers)
                response.raise_for_status()
                progress["completed"] += 1
                Logger.instance().success(f"\t{len(batch)} trace data files created.")
                return response.json()
        except httpx.HTTPStatusError as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] HTTP error while creating trace data files: {repr(e)} - Response: {e.response.text}"
            )
            raise
        except Exception as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to create trace data files: {repr(e)}"
            )
            raise


@retry(stop=stop_after_attempt(MAX_ATTEMPTS), wait=wait_fixed(2))
async def finish_trace_files(batch_ids, form_headers, host, progress):
    """
    Asynchronously uploads trace data files.
    """
    url = f"{host}/api/files/direct/finish/"
    attempt.set(attempt.get(0) + 1)
    ids = list(map(lambda id: {"id": id}, batch_ids))
    async with semaphore_3:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(url, json=ids, headers=form_headers)
                response.raise_for_status()
                progress["completed"] += 1
                Logger.instance().success(
                    f"\t{len(batch_ids)} trace data files finished [{progress['completed']}/{progress['total']}]"
                )
                return "finished"
        except httpx.HTTPStatusError as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] HTTP error while finishing trace data files: {repr(e)} - Response: {e.response.text}"
            )
            raise
        except Exception as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to finish trace data files: {repr(e)}"
            )
            raise


@retry(stop=stop_after_attempt(MAX_ATTEMPTS), wait=wait_fixed(2))
async def upload_trace_data(data_file_upload, output_dir, form_headers, host, progress):
    """
    Asynchronously uploads trace data files.
    """
    attempt.set(attempt.get(0) + 1)
    trace_name = data_file_upload["name"].split(".")[0]
    async with semaphore_50:
        try:
            data_file = f"{output_dir}/{trace_name}/data.json"
            # Add protocol and host to upload_url if it's a relative path
            upload_url = data_file_upload["upload_url"]
            if not upload_url.startswith(("http://", "https://")):
                # For local development, the API returns relative paths
                # We need to prepend the host
                if host.startswith(("http://", "https://")):
                    # Remove any trailing slash from host
                    host = host.rstrip('/')
                    upload_url = f"{host}{upload_url}"
                else:
                    Logger.instance().error(
                        f"Neither upload URL ({upload_url}) nor host ({host}) has a protocol."
                    )
                    raise ValueError("Missing protocol in both upload URL and host")

            # For local development, we need to handle CSRF
            request_headers = form_headers.copy()
            if "localhost" in host or "127.0.0.1" in host:
                # Get CSRF token from the API first
                async with httpx.AsyncClient(timeout=60) as client:
                    csrf_response = await client.get(f"{host}/api/csrf/")
                    if csrf_response.status_code == 200:
                        csrf_token = csrf_response.cookies.get("csrftoken")
                        if csrf_token:
                            request_headers["X-CSRFToken"] = csrf_token
                            # Also need to include the cookie
                            request_headers["Cookie"] = f"csrftoken={csrf_token}"

            Logger.instance().debug(f"\tUploading to URL: {upload_url}")
            async with httpx.AsyncClient(timeout=60) as client:
                async with aiofiles.open(data_file, "rb") as f:
                    response = await client.put(
                        upload_url,
                        content=await f.read(),
                        headers=request_headers,
                    )
                    response.raise_for_status()
                    progress["completed"] += 1
                    Logger.instance().success(
                        f"\tTrace '{trace_name}' data uploaded [{progress['completed']}/{progress['total']}]"
                    )
                    return "uploaded"
        except httpx.HTTPStatusError as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] HTTP error while creating trace '{trace_name}': {repr(e)} - Response: {e.response.text}"
            )
            raise
        except Exception as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to upload trace data for '{trace_name}': {repr(e)}"
            )
            raise


@retry(stop=stop_after_attempt(MAX_ATTEMPTS), wait=wait_fixed(2))
async def create_trace_records(batch, project_id, json_headers, host, progress):
    """
    Asynchronously creates a trace record on the server.
    """
    body = list(
        map(
            lambda data_file_upload: {
                "name": data_file_upload["name"].split(".")[0],
                "project_id": project_id,
                "data_file_id": data_file_upload["id"],
            },
            batch,
        )
    )
    async with semaphore_3:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                url = f"{host}/api/traces/"
                response = await client.post(url, json=body, headers=json_headers)
                response.raise_for_status()
                progress["completed"] += 1
                Logger.instance().success(
                    f"\t{len(batch)} traces created [{progress['completed']}/{progress['total']}]"
                )
                return response.json()
        except httpx.HTTPStatusError as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] HTTP error while creating {len(batch)} traces: {repr(e)} - Response: {e.response.text}"
            )
            raise
        except Exception as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to create {len(batch)} traces: {repr(e)}"
            )
            raise


async def process_traces_async(
    traces, output_dir, project_id, form_headers, json_headers, host
):
    """
    Coordinates the asynchronous upload of trace data files and the creation of trace records.
    """
    batch_size = 20
    total_operations = len(traces)  # Each trace has a data upload

    # For each batch upload
    total_operations += 3 * math.ceil(len(traces) / batch_size)
    progress = {"completed": 0, "total": total_operations}

    tasks = []
    for i in range(0, len(traces), batch_size):
        batch = traces[i : i + batch_size]
        create_trace_files_task = create_trace_files(
            batch, form_headers, host, progress
        )
        tasks.append(create_trace_files_task)
    data_file_ids = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(data_file_id, Exception) for data_file_id in data_file_ids):
        raise click.ClickException("Failed to create trace data files.")

    data_file_uploads = [item for sublist in data_file_ids for item in sublist]

    tasks = []
    for data_file_upload in data_file_uploads:
        # Upload data files concurrently
        data_file_task = upload_trace_data(
            data_file_upload, output_dir, form_headers, host, progress
        )
        tasks.append(data_file_task)

    # Wait for all data uploads to complete and gather results
    response_items = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(item, Exception) for item in response_items):
        raise click.ClickException("Failed to upload trace data.")

    data_file_ids = [item["id"] for item in data_file_uploads]

    tasks = []
    for i in range(0, len(data_file_ids), batch_size):
        batch = data_file_ids[i : i + batch_size]
        create_trace_files_task = finish_trace_files(
            batch, form_headers, host, progress
        )
        tasks.append(create_trace_files_task)

    response_items = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(item, Exception) for item in response_items):
        raise click.ClickException("Failed to finish trace data files.")

    # Prepare to create trace records based on successful uploads
    tasks = []
    for i in range(0, len(traces), batch_size):
        batch = data_file_uploads[i : i + batch_size]
        task = create_trace_records(batch, project_id, json_headers, host, progress)
        tasks.append(task)

    # Execute the creation of trace records concurrently
    response_items = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(item, Exception) for item in response_items):
        raise click.ClickException("Failed to create trace records.")


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
        serializer.dereference().model_dump_json(exclude_none=True)
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
        asyncio.run(
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

        # Deploy the project
        url = f"{host}/api/projects/{project_id}/"
        response = requests.put(
            url, data=json.dumps({"deploy_finished_at": "now"}), headers=json_headers
        )
        if response.status_code == 200:
            Logger.instance().success(
                f"Deployment completed in {time() - deploy_start_time:.2f} seconds"
            )
        else:
            Logger.instance().info(
                f"Deployment failed in {time() - deploy_start_time:.2f} seconds"
            )
            sys.exit(1)
        return project_url
    else:
        Logger.instance().info(
            f"Deployment failed in {time() - deploy_start_time:.2f} seconds"
        )
        raise click.ClickException(f"There was an unexpected error: {response.content}")
