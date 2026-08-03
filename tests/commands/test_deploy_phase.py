import asyncio
import os
import json
import re
from unittest import mock

from tests.factories.model_factories import (
    ProjectFactory,
    InputFactory,
    InsightFactory,
)
from tests.support.utils import temp_file, temp_folder, temp_yml_file
from visivo.commands.deploy_phase import (
    PURPOSE_BY_DESCRIPTION,
    collect_models_for_insights,
    collect_static_insight_parquet,
    create_insight_records,
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

    # Only the thumbnail is uploaded. Insight and input envelopes are sent as
    # `content` on the record — core never read the uploaded JSON back, so it
    # is not uploaded at all (VIS-1125).
    httpx_mock.add_response(method="PUT", url="http://google/upload/id3", status_code=200)
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


def test_each_job_type_owns_its_own_parquet_purpose():
    """A model, a static insight and an input's options are three different
    things. They all used to go up as model job data, which made a model and
    the insight built on it indistinguishable in the store (VIS-1126)."""
    assert PURPOSE_BY_DESCRIPTION["model"] == "model_job_data"
    assert PURPOSE_BY_DESCRIPTION["insight"] == "insight_job_data"
    assert PURPOSE_BY_DESCRIPTION["input"] == "input_job_data"


def test_insight_records_carry_content_and_no_file(httpx_mock):
    """The envelope IS the record. core builds its /api/insight-jobs/ response
    from `content` and never read the uploaded JSON back, so nothing is
    uploaded and no data_file_id is sent (VIS-1125)."""
    httpx_mock.add_response(
        method="POST", url="http://host/api/insight-jobs/", json=[{"id": "i1"}], status_code=201
    )

    asyncio.run(
        create_insight_records(
            [{"name": "orders_trend", "name_hash": "mabc", "content": {"type": "bar"}}],
            "proj-1",
            {},
            "http://host",
            {"completed": 0, "total": 1},
        )
    )

    [request] = httpx_mock.get_requests()
    [body] = json.loads(request.content)
    assert body == {
        "name": "orders_trend",
        "name_hash": "mabc",
        "project_id": "proj-1",
        "content": {"type": "bar"},
    }
    assert "data_file_id" not in body


def test_static_insight_parquet_is_not_collected_as_a_model(tmp_path):
    """A static insight's precomputed result is the INSIGHT's file.

    It used to be collected here and uploaded as a model named after the
    insight, which put a model and the insight built on it in the same place in
    the artifact store — and, under the typed layout, the same BigQuery table
    (VIS-1126).
    """
    output_dir = str(tmp_path)
    os.makedirs(os.path.join(output_dir, "files"))
    for name in ("static_insight", "orders"):
        with open(os.path.join(output_dir, "files", f"{name}.parquet"), "wb") as f:
            f.write(b"PAR1")

    # A plain stub rather than InsightFactory: the collectors only touch name,
    # name_hash and is_dynamic, and Insight is a pydantic model that rejects
    # attribute assignment.
    static = mock.Mock(name_hash=lambda: "mstatic", is_dynamic=lambda _dag: False)
    static.name = "static_insight"
    dag = mock.Mock()

    models = collect_models_for_insights([static], dag, output_dir)
    parquet = collect_static_insight_parquet([static], dag, output_dir)

    assert models == []
    assert [f["name"] for f in parquet] == ["static_insight"]
    assert parquet[0]["file_path"] == "files/static_insight.parquet"


def test_dynamic_insight_still_collects_its_dependent_models(tmp_path):
    """A dynamic insight owns no parquet — its data is the models it queries
    client-side, and those are still uploaded as models."""
    output_dir = str(tmp_path)
    os.makedirs(os.path.join(output_dir, "files"))
    with open(os.path.join(output_dir, "files", "orders.parquet"), "wb") as f:
        f.write(b"PAR1")

    model = mock.Mock()
    model.name = "orders"
    model.name_hash = lambda: "morders"
    dynamic = mock.Mock(
        name_hash=lambda: "mdynamic",
        is_dynamic=lambda _dag: True,
        get_all_dependent_models=lambda _dag: [model],
    )
    dynamic.name = "dynamic_insight"

    models = collect_models_for_insights([dynamic], mock.Mock(), output_dir)
    parquet = collect_static_insight_parquet([dynamic], mock.Mock(), output_dir)

    assert [m["name"] for m in models] == ["orders"]
    assert parquet == []
