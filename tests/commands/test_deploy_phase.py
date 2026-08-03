import asyncio
import os
import json
import re

from tests.factories.model_factories import (
    ProjectFactory,
    InputFactory,
    InsightFactory,
)
from tests.support.utils import temp_file, temp_folder, temp_yml_file
from visivo.commands.deploy_phase import (
    PURPOSE_BY_DESCRIPTION,
    deploy_phase,
    start_files,
)
from visivo.parsers.file_names import PROFILE_FILE_NAME, PROJECT_FILE_NAME

from visivo.utils import sanitize_filename


def test_deploy_with_insights_and_inputs_success(requests_mock, httpx_mock, capsys):
    """Test deploy with insights and inputs uploads."""
    output_dir = temp_folder()

    insight = InsightFactory(name="test_insight")
    input_obj = InputFactory(name="test_input")

    project = ProjectFactory()
    project_dict = json.loads(project.model_dump_json())

    project_dict["insights"] = [
        {"name": "test_insight", "props": {"type": "scatter", "x": "?{x}", "y": "?{y}"}}
    ]
    project_dict["inputs"] = [
        {"name": "test_input", "type": "single-select", "options": ["A", "B", "C"]}
    ]

    sanitized_name = sanitize_filename(project.dashboards[0].name)
    thumbnail_file_starts = [
        {
            "name": f"{sanitized_name}.png",
            "id": "id3",
            "upload_url": "http://google/upload/id3",
        },
    ]
    insight_file_starts = [
        {
            "name": f"{insight.name}.json",
            "id": "id4",
            "upload_url": "http://google/upload/id4",
        },
    ]
    input_file_starts = [
        {
            "name": f"{input_obj.name}.json",
            "id": "id5",
            "upload_url": "http://google/upload/id5",
        },
    ]

    run_id = "main"

    # Create dashboard thumbnail
    os.makedirs(os.path.join(output_dir, run_id, "dashboards"), exist_ok=True)
    thumbnail_path = os.path.join(output_dir, run_id, "dashboards", f"{sanitized_name}.png")
    with open(thumbnail_path, "wb") as f:
        f.write(b"dummy data")

    # Create insight JSON file
    os.makedirs(os.path.join(output_dir, run_id, "insights"), exist_ok=True)
    insight_path = os.path.join(output_dir, run_id, "insights", f"{insight.name}.json")
    with open(insight_path, "w") as f:
        json.dump({"name": insight.name, "query": "SELECT * FROM test"}, f)

    # Create input JSON file
    os.makedirs(os.path.join(output_dir, run_id, "inputs"), exist_ok=True)
    input_path = os.path.join(output_dir, run_id, "inputs", f"{input_obj.name}.json")
    with open(input_path, "w") as f:
        json.dump({"type": "single-select", "options": ["A", "B", "C"]}, f)

    tmp = temp_yml_file(dict=project_dict, name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)
    temp_file(PROFILE_FILE_NAME, "token: value", working_dir + "/.visivo")

    # Mock responses for thumbnail files
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/files/direct/start/",
        json=thumbnail_file_starts,
    )
    # Mock responses for insight files
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/files/direct/start/",
        json=insight_file_starts,
    )
    # Mock responses for input files
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/files/direct/start/",
        json=input_file_starts,
    )

    # Mock file uploads
    httpx_mock.add_response(method="PUT", url="http://google/upload/id3", status_code=200)
    httpx_mock.add_response(method="PUT", url="http://google/upload/id4", status_code=200)
    httpx_mock.add_response(method="PUT", url="http://google/upload/id5", status_code=200)

    # Mock file finish calls
    httpx_mock.add_response(
        method="POST", url="http://host/api/files/direct/finish/", status_code=204
    )
    httpx_mock.add_response(
        method="POST", url="http://host/api/files/direct/finish/", status_code=204
    )
    httpx_mock.add_response(
        method="POST", url="http://host/api/files/direct/finish/", status_code=204
    )

    # Mock record creation
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/dashboards/",
        json=[{"id": "id3"}],
        status_code=201,
    )
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/insight-jobs/",
        json=[{"id": "id4"}],
        status_code=201,
    )
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/input-jobs/",
        json=[{"id": "id5"}],
        status_code=201,
    )

    # Decomposed deploy: each resource type + defaults are posted via requests.
    requests_mock.post(
        re.compile(
            r"http://host/api/(sources|models|csv-script-models|local-merge-models"
            r"|dimensions|metrics|relations|charts|insights|tables|markdowns|inputs)/"
        ),
        json={"created": 0, "names": []},
        status_code=201,
    )
    requests_mock.post(re.compile(r"http://host/api/defaults/"), json={}, status_code=200)

    requests_mock.post(
        "http://host/api/projects/",
        json={"name": "name", "id": "id", "url": "/url"},
        status_code=201,
    )
    requests_mock.put(
        "http://host/api/projects/id/",
        json={"deploy_finished_at": "now"},
        status_code=200,
    )

    url = deploy_phase(
        stage="stage",
        working_dir=working_dir,
        user_dir=working_dir,
        output_dir=output_dir,
        host="http://host",
    )
    captured = capsys.readouterr()
    stdout = captured.out
    assert "/url" == url
    assert "Uploading project resources..." in stdout
    assert "Processing insight uploads..." in stdout
    assert "Processing input uploads..." in stdout
    assert "Processing model uploads..." in stdout
    assert "Deployment completed in" in stdout

    # The monolithic blob is no longer sent on the project create.
    projects_post = next(
        r
        for r in requests_mock.request_history
        if r.method == "POST" and r.url == "http://host/api/projects/"
    )
    assert "project_json" not in projects_post.json()
    # Resources were decomposed into per-type endpoint POSTs.
    posted_paths = {r.path for r in requests_mock.request_history if r.method == "POST"}
    assert "/api/charts/" in posted_paths


def test_start_files_declares_purpose_and_identity(httpx_mock):
    """Core builds an artifact's object path when it signs the upload URL —
    before it has seen a byte — so anything the deploy fails to declare here is
    unrecoverable. The file is already written under an `unknown` prefix by the
    time the record is created, where no query engine will find it.
    """
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/files/direct/start/",
        json=[{"id": "f1", "name": "orders.parquet", "upload_url": "http://host/put"}],
    )

    asyncio.run(
        start_files(
            [{"filename": "orders.parquet", "name": "orders"}],
            "model",
            {},
            "http://host",
            {"completed": 0, "total": 1},
            project_id="proj-1",
        )
    )

    [request] = httpx_mock.get_requests()
    assert json.loads(request.content) == [
        {
            "filename": "orders.parquet",
            "purpose": "model_job_data",
            "name": "orders",
            "project_id": "proj-1",
        }
    ]


def test_start_files_omits_identity_for_thumbnails(httpx_mock):
    """A thumbnail is metadata — nothing queries it, so it carries no project
    identity and core files it by account and date alone."""
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/files/direct/start/",
        json=[{"id": "f1", "name": "dash.png", "upload_url": "http://host/put"}],
    )

    asyncio.run(
        start_files(
            [{"filename": "dash.png"}],
            "thumbnail",
            {},
            "http://host",
            {"completed": 0, "total": 1},
        )
    )

    [request] = httpx_mock.get_requests()
    assert json.loads(request.content) == [{"filename": "dash.png", "purpose": "thumbnail"}]


def test_every_upload_description_maps_to_a_purpose():
    """A description with no purpose silently sends `null`, which core stores as
    UNKNOWN — the object still uploads, it just becomes unqueryable. Pin the map
    so adding an upload kind without a purpose fails here instead."""
    assert set(PURPOSE_BY_DESCRIPTION) == {"model", "insight", "input", "thumbnail"}
    assert all(PURPOSE_BY_DESCRIPTION.values())
