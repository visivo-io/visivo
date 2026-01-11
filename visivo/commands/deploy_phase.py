from visivo.models.dag import all_descendants_of_type
from visivo.models.dashboard import Dashboard
from visivo.models.trace import Trace
from visivo.models.insight import Insight
from visivo.models.inputs.input import Input
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
from visivo.server.store import background_jobs, background_jobs_lock

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
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to create {description} files: {repr(e)} - Response: {e.response.text}"
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
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to finish files: {repr(e)} - Response: {e.response.text}"
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
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to upload data for '{name}': {repr(e)} - Response: {e.response.text}"
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
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to create {len(batch)} traces: {repr(e)} - Response: {e.response.text}"
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
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to create {len(dashboards)} dashboards: {repr(e)} - Response: {e.response.text}"
            )
            raise
        except Exception as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to create {len(dashboards)} dashboards: {repr(e)}"
            )
            raise


@retry(stop=stop_after_attempt(MAX_ATTEMPTS), wait=wait_fixed(2))
async def create_insight_records(batch, project_id, json_headers, host, progress):
    """
    Asynchronously creates insight records on the server.
    """
    body = list(
        map(
            lambda data_file_upload: {
                "name": data_file_upload["name"],
                "name_hash": data_file_upload["name_hash"],
                "project_id": project_id,
                "data_file_id": data_file_upload["id"],
            },
            batch,
        )
    )
    async with semaphore_3:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                url = f"{host}/api/insight-jobs/"
                response = await client.post(url, json=body, headers=json_headers)
                response.raise_for_status()
                progress["completed"] += 1
                Logger.instance().success(
                    f"\t{len(batch)} insights created [{progress['completed']}/{progress['total']}]"
                )
                return response.json()
        except httpx.HTTPStatusError as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to create {len(batch)} insights: {repr(e)} - Response: {e.response.text}"
            )
            raise
        except Exception as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to create {len(batch)} insights: {repr(e)}"
            )
            raise


@retry(stop=stop_after_attempt(MAX_ATTEMPTS), wait=wait_fixed(2))
async def create_input_records(batch, project_id, json_headers, host, progress):
    """
    Asynchronously creates input records on the server.
    """
    body = list(
        map(
            lambda data_file_upload: {
                "name": data_file_upload["name"],
                "name_hash": data_file_upload["name_hash"],
                "project_id": project_id,
                "data_file_id": data_file_upload["id"],
            },
            batch,
        )
    )
    async with semaphore_3:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                url = f"{host}/api/input-jobs/"
                response = await client.post(url, json=body, headers=json_headers)
                response.raise_for_status()
                progress["completed"] += 1
                Logger.instance().success(
                    f"\t{len(batch)} inputs created [{progress['completed']}/{progress['total']}]"
                )
                return response.json()
        except httpx.HTTPStatusError as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to create {len(batch)} inputs: {repr(e)} - Response: {e.response.text}"
            )
            raise
        except Exception as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to create {len(batch)} inputs: {repr(e)}"
            )
            raise


@retry(stop=stop_after_attempt(MAX_ATTEMPTS), wait=wait_fixed(2))
async def create_model_records(batch, project_id, json_headers, host, progress):
    """
    Asynchronously creates model records on the server.
    """
    body = list(
        map(
            lambda data_file_upload: {
                "name": data_file_upload["name"],
                "name_hash": data_file_upload["name_hash"],
                "project_id": project_id,
                "data_file_id": data_file_upload["id"],
            },
            batch,
        )
    )
    async with semaphore_3:
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                url = f"{host}/api/models/"
                response = await client.post(url, json=body, headers=json_headers)
                response.raise_for_status()
                progress["completed"] += 1
                Logger.instance().success(
                    f"\t{len(batch)} models created [{progress['completed']}/{progress['total']}]"
                )
                return response.json()
        except httpx.HTTPStatusError as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to create {len(batch)} models: {repr(e)} - Response: {e.response.text}"
            )
            raise
        except Exception as e:
            Logger.instance().error(
                f"\t[Attempt {attempt.get()}/{MAX_ATTEMPTS}] Failed to create {len(batch)} models: {repr(e)}"
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


async def process_insights_async(
    insights, output_dir, project_id, form_headers, json_headers, host
):
    """
    Coordinates the asynchronous upload of insight JSON files and creation of insight records.
    """
    batch_size = 20

    # Build list of insight files that exist
    insight_files = []
    for insight in insights:
        insight_hash = insight.name_hash()
        insight_path = f"{output_dir}/insights/{insight_hash}.json"
        if os.path.exists(insight_path):
            insight_files.append(
                {
                    "name": insight.name,
                    "name_hash": insight_hash,
                    "file_path": f"insights/{insight_hash}.json",
                }
            )

    if not insight_files:
        return

    total_operations = len(insight_files)
    total_operations += 3 * math.ceil(len(insight_files) / batch_size)
    progress = {"completed": 0, "total": total_operations}

    # Create file records
    tasks = []
    for i in range(0, len(insight_files), batch_size):
        batch = insight_files[i : i + batch_size]
        file_names = [f["file_path"].split("/")[-1] for f in batch]
        task = start_files(file_names, "insight", form_headers, host, progress)
        tasks.append(task)
    data_file_ids = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(r, Exception) for r in data_file_ids):
        raise click.ClickException("Failed to create insight files.")

    data_file_uploads = [item for sublist in data_file_ids for item in sublist]

    # Upload files
    tasks = []
    for i, data_file_upload in enumerate(data_file_uploads):
        insight_file = insight_files[i]
        task = upload_file(
            insight_file["name"],
            data_file_upload["upload_url"],
            insight_file["file_path"],
            output_dir,
            form_headers,
            progress,
        )
        tasks.append(task)
    response_items = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(item, Exception) for item in response_items):
        raise click.ClickException("Failed to upload insight data.")

    # Finish files
    data_file_ids_list = [item["id"] for item in data_file_uploads]
    tasks = []
    for i in range(0, len(data_file_ids_list), batch_size):
        batch = data_file_ids_list[i : i + batch_size]
        task = finish_files(batch, "insight", form_headers, host, progress)
        tasks.append(task)
    response_items = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(item, Exception) for item in response_items):
        raise click.ClickException("Failed to finish insight files.")

    # Create insight records - merge insight metadata with file upload info
    for i, upload in enumerate(data_file_uploads):
        upload["name"] = insight_files[i]["name"]
        upload["name_hash"] = insight_files[i]["name_hash"]

    tasks = []
    for i in range(0, len(data_file_uploads), batch_size):
        batch = data_file_uploads[i : i + batch_size]
        task = create_insight_records(batch, project_id, json_headers, host, progress)
        tasks.append(task)
    response_items = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(item, Exception) for item in response_items):
        raise click.ClickException("Failed to create insight records.")


async def process_inputs_async(inputs, output_dir, project_id, form_headers, json_headers, host):
    """
    Coordinates the asynchronous upload of input JSON files and creation of input records.
    """
    batch_size = 20

    # Build list of input files that exist
    input_files = []
    for input_obj in inputs:
        input_hash = input_obj.name_hash()
        input_path = f"{output_dir}/inputs/{input_hash}.json"
        if os.path.exists(input_path):
            input_files.append(
                {
                    "name": input_obj.name,
                    "name_hash": input_hash,
                    "file_path": f"inputs/{input_hash}.json",
                }
            )

    if not input_files:
        return

    total_operations = len(input_files)
    total_operations += 3 * math.ceil(len(input_files) / batch_size)
    progress = {"completed": 0, "total": total_operations}

    # Create file records
    tasks = []
    for i in range(0, len(input_files), batch_size):
        batch = input_files[i : i + batch_size]
        file_names = [f["file_path"].split("/")[-1] for f in batch]
        task = start_files(file_names, "input", form_headers, host, progress)
        tasks.append(task)
    data_file_ids = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(r, Exception) for r in data_file_ids):
        raise click.ClickException("Failed to create input files.")

    data_file_uploads = [item for sublist in data_file_ids for item in sublist]

    # Upload files
    tasks = []
    for i, data_file_upload in enumerate(data_file_uploads):
        input_file = input_files[i]
        task = upload_file(
            input_file["name"],
            data_file_upload["upload_url"],
            input_file["file_path"],
            output_dir,
            form_headers,
            progress,
        )
        tasks.append(task)
    response_items = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(item, Exception) for item in response_items):
        raise click.ClickException("Failed to upload input data.")

    # Finish files
    data_file_ids_list = [item["id"] for item in data_file_uploads]
    tasks = []
    for i in range(0, len(data_file_ids_list), batch_size):
        batch = data_file_ids_list[i : i + batch_size]
        task = finish_files(batch, "input", form_headers, host, progress)
        tasks.append(task)
    response_items = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(item, Exception) for item in response_items):
        raise click.ClickException("Failed to finish input files.")

    # Create input records - merge input metadata with file upload info
    for i, upload in enumerate(data_file_uploads):
        upload["name"] = input_files[i]["name"]
        upload["name_hash"] = input_files[i]["name_hash"]

    tasks = []
    for i in range(0, len(data_file_uploads), batch_size):
        batch = data_file_uploads[i : i + batch_size]
        task = create_input_records(batch, project_id, json_headers, host, progress)
        tasks.append(task)
    response_items = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(item, Exception) for item in response_items):
        raise click.ClickException("Failed to create input records.")


async def process_models_async(models, output_dir, project_id, form_headers, json_headers, host):
    """
    Coordinates the asynchronous upload of model parquet files and creation of records.
    """
    batch_size = 20

    if not models:
        return

    total_operations = len(models)
    total_operations += 3 * math.ceil(len(models) / batch_size)
    progress = {"completed": 0, "total": total_operations}

    # Create file records
    tasks = []
    for i in range(0, len(models), batch_size):
        batch = models[i : i + batch_size]
        file_names = [f["file_path"].split("/")[-1] for f in batch]
        task = start_files(file_names, "model", form_headers, host, progress)
        tasks.append(task)
    data_file_ids = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(r, Exception) for r in data_file_ids):
        raise click.ClickException("Failed to create models.")

    data_file_uploads = [item for sublist in data_file_ids for item in sublist]

    # Upload files
    tasks = []
    for i, data_file_upload in enumerate(data_file_uploads):
        model = models[i]
        task = upload_file(
            model["name"],
            data_file_upload["upload_url"],
            model["file_path"],
            output_dir,
            form_headers,
            progress,
        )
        tasks.append(task)
    response_items = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(item, Exception) for item in response_items):
        raise click.ClickException("Failed to upload model data.")

    # Finish files
    data_file_ids_list = [item["id"] for item in data_file_uploads]
    tasks = []
    for i in range(0, len(data_file_ids_list), batch_size):
        batch = data_file_ids_list[i : i + batch_size]
        task = finish_files(batch, "model", form_headers, host, progress)
        tasks.append(task)
    response_items = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(item, Exception) for item in response_items):
        raise click.ClickException("Failed to finish models.")

    # Create model records - merge model metadata with file upload info
    for i, upload in enumerate(data_file_uploads):
        upload["name"] = models[i]["name"]
        upload["name_hash"] = models[i]["name_hash"]

    tasks = []
    for i in range(0, len(data_file_uploads), batch_size):
        batch = data_file_uploads[i : i + batch_size]
        task = create_model_records(batch, project_id, json_headers, host, progress)
        tasks.append(task)
    response_items = await asyncio.gather(*tasks, return_exceptions=True)
    if any(isinstance(item, Exception) for item in response_items):
        raise click.ClickException("Failed to create model records.")


def collect_models_for_insights(insights, dag, output_dir):
    """
    Collect parquet files needed by insights for client-side DuckDB queries.

    There are two types of parquet files:
    1. Static insight result files: Pre-computed query results stored at
       files/{insight.name_hash()}.parquet - these need to be uploaded so the
       client can load them via DuckDB.
    2. Model files for dynamic insights: Model parquet files at
       files/{model.name_hash()}.parquet - only needed for insights with
       Input dependencies that require client-side queries on model data.
    """
    models_dict = {}

    for insight in insights:
        if insight.is_dynamic(dag):
            # Dynamic insights need model parquet files for client-side queries
            for model in insight.get_all_dependent_models(dag):
                model_hash = model.name_hash()
                parquet_path = f"{output_dir}/files/{model_hash}.parquet"
                if os.path.exists(parquet_path):
                    models_dict[model_hash] = {
                        "name": model.name,
                        "name_hash": model_hash,
                        "file_path": f"files/{model_hash}.parquet",
                    }
        else:
            # Static insights have pre-computed result files that need to be uploaded
            insight_hash = insight.name_hash()
            parquet_path = f"{output_dir}/files/{insight_hash}.parquet"
            if os.path.exists(parquet_path):
                models_dict[insight_hash] = {
                    "name": insight.name,
                    "name_hash": insight_hash,
                    "file_path": f"files/{insight_hash}.parquet",
                }

    return list(models_dict.values())


def collect_parquet_files_for_inputs(inputs, output_dir):
    """
    Collect parquet files for inputs that have query-based options.

    Reads each input's metadata JSON to find parquet file references
    in the files[] array, then returns a list of file info for upload.
    """
    parquet_files = {}

    for input_obj in inputs:
        input_hash = input_obj.name_hash()
        metadata_path = f"{output_dir}/inputs/{input_hash}.json"

        if not os.path.exists(metadata_path):
            continue

        try:
            with open(metadata_path, "r") as f:
                metadata = json.load(f)

            # Check for parquet files in the files array
            if "files" in metadata and isinstance(metadata["files"], list):
                for file_ref in metadata["files"]:
                    if "name_hash" in file_ref and "signed_data_file_url" in file_ref:
                        file_hash = file_ref["name_hash"]
                        # The signed_data_file_url contains the local path like
                        # {output_dir}/files/{hash}_options.parquet
                        file_path = file_ref["signed_data_file_url"]
                        # Extract the relative path from output_dir
                        if file_path.startswith(output_dir):
                            file_path = file_path[len(output_dir) + 1 :]

                        if os.path.exists(f"{output_dir}/{file_path}"):
                            parquet_files[file_hash] = {
                                "name": f"{input_obj.name}_{file_ref.get('key', 'data')}",
                                "name_hash": file_hash,
                                "file_path": file_path,
                            }
        except (json.JSONDecodeError, IOError):
            # Skip inputs with invalid or unreadable metadata
            continue

    return list(parquet_files.values())


def deploy_phase(working_dir, user_dir, output_dir, stage, host, deploy_id=None):
    """
    Synchronous function to manage the deployment, including initiating asynchronous operations.
    """

    def send_progress(message, level="info", status=200, project_url=None):
        if deploy_id:
            log = {"message": message, "level": level, "status": status, "project_url": project_url}

            with background_jobs_lock:
                if deploy_id in background_jobs:
                    background_jobs[deploy_id] = log

        getattr(Logger.instance(), level)(message)

    deploy_start_time = time()
    # Retrieve profile token for authentication
    send_progress("Retrieving profile token...", "debug", 202)
    profile_file = get_profile_file(home_dir=user_dir)
    profile_token = get_profile_token(profile_file)
    send_progress(f"Found Profile token: {profile_file}", "info")

    # Discover and parse project details
    Logger.instance().info(f"")
    send_progress("Compiling project details...", "debug", 202)

    discover = Discover(working_dir=working_dir, home_dir=user_dir, output_dir=output_dir)
    parser = ParserFactory().build(project_file=discover.project_file, files=discover.files)
    project = parser.parse()
    serializer = Serializer(project=project)
    project_json = json.loads(serializer.dereference().model_dump_json(exclude_none=True))
    send_progress(f"Project Compiled in {time() - deploy_start_time:.2f} seconds", "success")

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
    send_progress("Uploading project information...", "info")
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
        send_progress("Processing trace uploads and record creations...", "info")
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
        send_progress(
            f"Trace uploads completed in {time() - process_traces_start_time:.2f} seconds", "info"
        )

        # Process thumbnails
        send_progress("Processing dashboard uploads...", "info")
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
        send_progress(
            f"Thumbnail uploads completed in {time() - process_thumbnails_start_time:.2f} seconds",
            "info",
        )

        # Process insights
        Logger.instance().info(f"")
        send_progress("Processing insight uploads...", "info")
        process_insights_start_time = time()
        insights = all_descendants_of_type(type=Insight, dag=dag)
        if insights:
            asyncio.run(
                process_insights_async(
                    insights=insights,
                    output_dir=output_dir,
                    project_id=project_id,
                    form_headers=form_headers,
                    json_headers=json_headers,
                    host=host,
                )
            )
        send_progress(
            f"Insight uploads completed in {time() - process_insights_start_time:.2f} seconds",
            "info",
        )

        # Process inputs (metadata JSON files)
        Logger.instance().info(f"")
        send_progress("Processing input uploads...", "info")
        process_inputs_start_time = time()
        inputs = project.inputs if hasattr(project, "inputs") and project.inputs else []
        if inputs:
            asyncio.run(
                process_inputs_async(
                    inputs=inputs,
                    output_dir=output_dir,
                    project_id=project_id,
                    form_headers=form_headers,
                    json_headers=json_headers,
                    host=host,
                )
            )
        send_progress(
            f"Input uploads completed in {time() - process_inputs_start_time:.2f} seconds",
            "info",
        )

        # Process input parquet files (for query-based options)
        Logger.instance().info(f"")
        send_progress("Processing input parquet files...", "info")
        process_input_parquet_start_time = time()
        input_parquet_files = collect_parquet_files_for_inputs(inputs, output_dir)
        if input_parquet_files:
            asyncio.run(
                process_models_async(
                    models=input_parquet_files,
                    output_dir=output_dir,
                    project_id=project_id,
                    form_headers=form_headers,
                    json_headers=json_headers,
                    host=host,
                )
            )
        send_progress(
            f"Input parquet uploads completed in {time() - process_input_parquet_start_time:.2f} seconds",
            "info",
        )

        # Process models (for insights)
        Logger.instance().info(f"")
        send_progress("Processing model uploads...", "info")
        process_models_start_time = time()
        models = collect_models_for_insights(insights, dag, output_dir)
        if models:
            asyncio.run(
                process_models_async(
                    models=models,
                    output_dir=output_dir,
                    project_id=project_id,
                    form_headers=form_headers,
                    json_headers=json_headers,
                    host=host,
                )
            )
        send_progress(
            f"Model uploads completed in {time() - process_models_start_time:.2f} seconds",
            "info",
        )

        # Deploy the project
        url = f"{host}/api/projects/{project_id}/"
        response = requests.put(
            url, data=json.dumps({"deploy_finished_at": "now"}), headers=json_headers
        )
        if response.status_code == 200:
            send_progress(
                f"Deployment completed in {time() - deploy_start_time:.2f} seconds",
                "success",
                201,
                project_url,
            )

        else:
            send_progress(
                f"Deployment failed in {time() - deploy_start_time:.2f} seconds", "info", 400
            )
            sys.exit(1)
        return project_url
    else:
        send_progress(f"Deployment failed in {time() - deploy_start_time:.2f} seconds", "info", 400)
        raise click.ClickException(f"There was an unexpected error: {response.content}")
