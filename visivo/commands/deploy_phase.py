from visivo.models.dag import all_descendants_of_type
from visivo.models.dashboard import Dashboard
from visivo.models.trace import Trace
import click
import requests
import math
import json
import sys
import asyncio
import aiofiles
import httpx
import os
import contextvars
from time import time
from tenacity import retry, stop_after_attempt, wait_fixed
from visivo.commands.utils import get_profile_file, get_profile_token
from visivo.discovery.discover import Discover
from visivo.logger.logger import Logger
from visivo.parsers.serializer import Serializer
from visivo.parsers.parser_factory import ParserFactory
from visivo.utils import get_dashboards_dir, sanitize_filename

# Limit concurrent uploads to avoid overloading the API
semaphore_3 = asyncio.Semaphore(3)
semaphore_50 = asyncio.Semaphore(50)
attempt = contextvars.ContextVar("attempt")
MAX_ATTEMPTS = 3


@retry(stop=stop_after_attempt(MAX_ATTEMPTS), wait=wait_fixed(2))
async def start_files(file_names, description, form_headers, host, progress):
    """
    Asynchronously uploads trace data files.
    """
    files = list(map(lambda file_name: {"filename": file_name}, file_names))
    url = f"{host}/api/files/direct/start/"
    attempt.set(attempt.get(0) + 1)
    async with semaphore_3:
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(url, json=files, headers=form_headers)
                response.raise_for_status()
                progress["completed"] += 1
                Logger.instance().success(
                    f"\t{len(file_names)} {description} files created. [{progress['completed']}/{progress['total']}]"
                )
                return response.json()
        except httpx.HTTPStatusError as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] HTTP error while creating {description} files: {repr(e)} - Response: {e.response.text}"
            )
            raise
        except Exception as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to create {description} files: {repr(e)}"
            )
            raise


@retry(stop=stop_after_attempt(MAX_ATTEMPTS), wait=wait_fixed(2))
async def finish_files(file_ids, description, form_headers, host, progress):
    """
    Asynchronously uploads trace data files.
    """
    url = f"{host}/api/files/direct/finish/"
    attempt.set(attempt.get(0) + 1)
    ids = list(map(lambda id: {"id": id}, file_ids))
    async with semaphore_3:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.post(url, json=ids, headers=form_headers)
                response.raise_for_status()
                progress["completed"] += 1
                Logger.instance().success(
                    f"\t{len(file_ids)} {description} files finished [{progress['completed']}/{progress['total']}]"
                )
                return "finished"
        except httpx.HTTPStatusError as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] HTTP error while finishing files: {repr(e)} - Response: {e.response.text}"
            )
            raise
        except Exception as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to finish files: {repr(e)}"
            )
            raise


@retry(stop=stop_after_attempt(MAX_ATTEMPTS), wait=wait_fixed(2))
async def upload_file(name, upload_url, file_name, output_dir, form_headers, progress):
    """
    Asynchronously uploads trace data files.
    """
    attempt.set(attempt.get(0) + 1)
    async with semaphore_50:
        try:
            data_file = f"{output_dir}/{file_name}"
            additional_headers = {}
            if "localhost" in upload_url:
                additional_headers["Content-Disposition"] = f"inline;filename={file_name}"
            async with httpx.AsyncClient(timeout=30) as client:
                async with aiofiles.open(data_file, "rb") as f:
                    response = await client.put(
                        upload_url,
                        content=await f.read(),
                        headers={**form_headers, **additional_headers},
                    )
                    response.raise_for_status()
                    progress["completed"] += 1
                    Logger.instance().success(
                        f"\t'{name}' file uploaded [{progress['completed']}/{progress['total']}]"
                    )
                    return "uploaded"
        except httpx.HTTPStatusError as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] HTTP error while creating '{name}': {repr(e)} - Response: {e.response.text}"
            )
            raise
        except Exception as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to upload data for '{name}': {repr(e)}"
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


@retry(stop=stop_after_attempt(MAX_ATTEMPTS), wait=wait_fixed(2))
async def create_dashboard_records(
    dashboards, thumbnail_file_uploads, project_id, json_headers, host, progress
):
    """
    Asynchronously creates a trace record on the server.
    """

    def dashboard_body(dashboard):
        thumbnail_file_id = next(
            (
                upload["id"]
                for upload in thumbnail_file_uploads
                if upload["name"].startswith(sanitize_filename(dashboard.name))
            ),
            None,
        )
        dashboard_body = {
            "name": dashboard.name,
            "project_id": project_id,
        }
        if thumbnail_file_id:
            dashboard_body["thumbnail_file_id"] = thumbnail_file_id
        return dashboard_body

    body = list(map(dashboard_body, dashboards))
    async with semaphore_3:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                url = f"{host}/api/dashboards/"
                response = await client.post(url, json=body, headers=json_headers)
                response.raise_for_status()
                progress["completed"] += 1
                Logger.instance().success(
                    f"\t{len(dashboards)} dashboards created [{progress['completed']}/{progress['total']}]"
                )
                return response.json()
        except httpx.HTTPStatusError as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] HTTP error while creating {len(dashboards)} dashboards: {repr(e)} - Response: {e.response.text}"
            )
            raise
        except Exception as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to create {len(dashboards)} dashboards: {repr(e)}"
            )
            raise


async def process_traces_async(traces, output_dir, project_id, form_headers, json_headers, host):
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
        traces_batch = traces[i : i + batch_size]
        traces_batch_file_names = list(map(lambda trace: trace.name, traces_batch))
        create_trace_files_task = start_files(
            traces_batch_file_names, "trace", form_headers, host, progress
        )
        tasks.append(create_trace_files_task)
    data_file_ids = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(data_file_id, Exception) for data_file_id in data_file_ids):
        raise click.ClickException("Failed to create trace data files.")

    data_file_uploads = [item for sublist in data_file_ids for item in sublist]

    tasks = []
    for data_file_upload in data_file_uploads:
        # Upload data files concurrently
        trace_name = data_file_upload["name"].split(".")[0]
        data_file_task = upload_file(
            trace_name,
            data_file_upload["upload_url"],
            f"traces/{trace_name}/data.json",
            output_dir,
            form_headers,
            progress,
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
        create_trace_files_task = finish_files(batch, "trace", form_headers, host, progress)
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


async def process_dashboards_async(
    dashboards, output_dir, project_id, form_headers, json_headers, host
):
    """
    Coordinates the asynchronous upload of thumbnail files.
    """
    dashboards_dir = get_dashboards_dir(output_dir)
    if not os.path.exists(dashboards_dir):
        thumbnail_files = []
    else:
        thumbnail_files = [f for f in os.listdir(dashboards_dir) if f.endswith(".png")]

    total_operations = len(thumbnail_files)  # Each thumbnail has a data upload
    total_operations += 3  # For create, upload and dashboard record creation
    progress = {"completed": 0, "total": total_operations}

    file_names = []
    for dashboard in dashboards:
        sanitized_name = sanitize_filename(dashboard.name)
        if os.path.exists(f"{dashboards_dir}/{sanitized_name}.png"):
            file_names.append(f"{sanitized_name}.png")

    create_thumbnail_files_task = start_files(file_names, "thumbnail", form_headers, host, progress)

    thumbnail_file_uploads_nested = await asyncio.gather(
        create_thumbnail_files_task, return_exceptions=True
    )
    if any(isinstance(data_file_id, Exception) for data_file_id in thumbnail_file_uploads_nested):
        raise click.ClickException("Failed to create thumbnail files.")

    thumbnail_file_uploads = [item for sublist in thumbnail_file_uploads_nested for item in sublist]

    tasks = []
    for thumbnail_file_upload in thumbnail_file_uploads:
        # Upload data files concurrently
        file_name = thumbnail_file_upload["name"]
        dashboard = next(
            (
                dashboard
                for dashboard in dashboards
                if sanitize_filename(dashboard.name) == file_name.split(".")[0]
            ),
            None,
        )
        data_file_task = upload_file(
            dashboard.name,
            thumbnail_file_upload["upload_url"],
            f"dashboards/{file_name}",
            output_dir,
            form_headers,
            progress,
        )
        tasks.append(data_file_task)

    await asyncio.gather(*tasks)
    uploaded_ids = [item["id"] for item in thumbnail_file_uploads]

    # Finish the upload process
    tasks = []
    tasks.append(finish_files(uploaded_ids, "thumbnail", form_headers, host, progress))
    response_items = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(item, Exception) for item in response_items):
        raise click.ClickException("Failed to finish thumbnail files.")

    tasks = []
    tasks.append(
        create_dashboard_records(
            dashboards, thumbnail_file_uploads, project_id, json_headers, host, progress
        )
    )

    # Execute the creation of trace records concurrently
    response_items = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(item, Exception) for item in response_items):
        raise click.ClickException("Failed to create dashboard records.")


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
    discover = Discover(working_dir=working_dir, home_dir=user_dir, output_dir=output_dir)
    parser = ParserFactory().build(project_file=discover.project_file, files=discover.files)
    project = parser.parse()
    serializer = Serializer(project=project)
    project_json = json.loads(serializer.dereference().model_dump_json(exclude_none=True))
    Logger.instance().success(f"Project Compiled in {time() - deploy_start_time:.2f} seconds")

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
    Logger.instance().info("Uploading project information...")
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

        # Process traces
        Logger.instance().info(f"")
        Logger.instance().info("Processing trace uploads and record creations...")
        process_traces_start_time = time()

        traces = []
        dag = project.dag()
        dashboards = all_descendants_of_type(type=Dashboard, dag=dag)
        for dashboard in dashboards:
            traces.extend(all_descendants_of_type(type=Trace, dag=dag, from_node=dashboard))
        traces = list(set(traces))
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

        # Process thumbnails
        Logger.instance().info("Processing dashboard uploads...")
        process_thumbnails_start_time = time()
        dashboards = project.descendants_of_type(type=Dashboard)

        asyncio.run(
            process_dashboards_async(
                dashboards=dashboards,
                output_dir=output_dir,
                project_id=project_id,
                form_headers=form_headers,
                json_headers=json_headers,
                host=host,
            )
        )
        Logger.instance().info(
            f"Thumbnail uploads completed in {time() - process_thumbnails_start_time:.2f} seconds"
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
            Logger.instance().info(f"Deployment failed in {time() - deploy_start_time:.2f} seconds")
            sys.exit(1)
        return project_url
    else:
        Logger.instance().info(f"Deployment failed in {time() - deploy_start_time:.2f} seconds")
        raise click.ClickException(f"There was an unexpected error: {response.content}")
