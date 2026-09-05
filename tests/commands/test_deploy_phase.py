import asyncio
import os
import json
import re
from unittest import mock

import click
import pytest

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
    verify_run_output,
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

    # Create insight JSON file, and the parquet a STATIC insight produces
    # alongside it — verify_run_output requires both, because a deploy missing
    # either uploads nothing for that insight and still reports success.
    os.makedirs(os.path.join(output_dir, run_id, "insights"), exist_ok=True)
    insight_path = os.path.join(output_dir, run_id, "insights", f"{insight.name}.json")
    with open(insight_path, "w") as f:
        json.dump({"name": insight.name, "query": "SELECT * FROM test"}, f)
    # ProjectFactory's dashboard carries its own inline insight, and a real run
    # would build that one too — so the fixture has to, or verify_run_output
    # correctly objects. Its name comes from the factory, not from us.
    for name in (insight.name, "insight"):
        with open(os.path.join(output_dir, run_id, "insights", f"{name}.json"), "w") as f:
            json.dump({"name": name, "query": "SELECT * FROM test"}, f)
        with open(os.path.join(output_dir, run_id, "insights", f"{name}.parquet"), "wb") as f:
            f.write(b"PAR1")

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

    # The thumbnail, plus each STATIC insight's precomputed parquet — that is
    # the insight's own file now (VIS-1126). Envelopes are still not uploaded;
    # they ride as `content` on the record (VIS-1125).
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/files/direct/start/",
        json=[
            {"name": f"{n}.parquet", "id": f"ip-{i}", "upload_url": f"http://google/upload/ip-{i}"}
            for i, n in enumerate((insight.name, "insight"))
        ],
    )
    httpx_mock.add_response(method="PUT", url="http://google/upload/id3", status_code=200)
    for i in range(2):
        httpx_mock.add_response(method="PUT", url=f"http://google/upload/ip-{i}", status_code=200)
    for _ in range(2):
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


def test_deploy_requires_a_project_name():
    """`Project.name` is Optional (like every NamedModel) and `exclude_none=True`
    drops it from project_json entirely when unset, so a project file with no
    top-level `name:` parses and runs fine but crashed deploy with a bare
    KeyError on project_json["name"] — hit in practice on a hand-authored
    project file that never went through `visivo init` (whose template does
    set `name:`). Fail loudly with an actionable message instead."""
    project = ProjectFactory()
    project_dict = json.loads(project.model_dump_json())
    project_dict.pop("name", None)

    tmp = temp_yml_file(dict=project_dict, name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)
    temp_file(PROFILE_FILE_NAME, "token: value", working_dir + "/.visivo")

    with pytest.raises(click.ClickException) as exc:
        deploy_phase(
            stage="stage",
            working_dir=working_dir,
            user_dir=working_dir,
            output_dir=temp_folder(),
            host="http://host",
        )

    assert "name" in str(exc.value)


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
    os.makedirs(os.path.join(output_dir, "insights"))
    os.makedirs(os.path.join(output_dir, "models"))
    with open(os.path.join(output_dir, "insights", "static_insight.parquet"), "wb") as f:
        f.write(b"PAR1")
    with open(os.path.join(output_dir, "models", "orders.parquet"), "wb") as f:
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
    assert parquet[0]["file_path"] == "insights/static_insight.parquet"


def test_dynamic_insight_still_collects_its_dependent_models(tmp_path):
    """A dynamic insight owns no parquet — its data is the models it queries
    client-side, and those are still uploaded as models."""
    output_dir = str(tmp_path)
    os.makedirs(os.path.join(output_dir, "models"))
    with open(os.path.join(output_dir, "models", "orders.parquet"), "wb") as f:
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


def _project_with_insight(name="line-trace"):
    insight = mock.Mock()
    insight.name = name
    project = mock.Mock(inputs=[])
    project.dag = lambda: mock.Mock()
    return project, insight


def _envelope(dirpath, name, referenced=None):
    os.makedirs(dirpath, exist_ok=True)
    files = [{"name_hash": "m" + name, "signed_data_file_url": referenced}] if referenced else []
    with open(os.path.join(dirpath, f"{name}.json"), "w") as f:
        json.dump({"name": name, "files": files}, f)


def test_verify_run_output_passes_when_every_reference_resolves(tmp_path):
    insights = os.path.join(str(tmp_path), "insights")
    _envelope(insights, "line-trace", f"{tmp_path}/insights/line-trace.parquet")
    open(os.path.join(insights, "line-trace.parquet"), "wb").close()
    project, insight = _project_with_insight()

    with mock.patch("visivo.commands.deploy_phase.all_descendants_of_type", return_value=[insight]):
        verify_run_output(project, str(tmp_path))  # does not raise


def test_verify_run_output_accepts_an_insight_that_produced_no_parquet(tmp_path):
    """The false positive CI caught. An earlier version predicted which
    insights should have a parquet from `is_dynamic(dag)` — "has any Input
    descendant" — while the run branches on `insight_query_info.pre_query`.
    Those disagree, so it demanded files that legitimately do not exist.

    The envelope is the run's own record: no reference, nothing to check."""
    _envelope(os.path.join(str(tmp_path), "insights"), "line-trace")
    project, insight = _project_with_insight()

    with mock.patch("visivo.commands.deploy_phase.all_descendants_of_type", return_value=[insight]):
        verify_run_output(project, str(tmp_path))  # does not raise


def test_verify_run_output_rejects_a_stale_layout(tmp_path):
    """A stale target/ has the file — in the files/ directory nothing reads any
    more. Checking existence alone would pass it and deploy nothing."""
    _envelope(
        os.path.join(str(tmp_path), "insights"),
        "line-trace",
        f"{tmp_path}/files/line-trace.parquet",
    )
    os.makedirs(os.path.join(str(tmp_path), "files"))
    open(os.path.join(str(tmp_path), "files", "line-trace.parquet"), "wb").close()
    project, insight = _project_with_insight()

    with mock.patch("visivo.commands.deploy_phase.all_descendants_of_type", return_value=[insight]):
        with pytest.raises(click.ClickException):
            verify_run_output(project, str(tmp_path))


def test_verify_run_output_ignores_an_insight_that_built_nothing(tmp_path):
    """An insight can produce no envelope — it may have failed to build, or not
    be reachable — and `visivo run` exits 0 either way. That is the run's
    business. Asserting it here failed real deploys over a pre-existing
    condition unrelated to whether the output is readable."""
    os.makedirs(os.path.join(str(tmp_path), "insights"))
    project, insight = _project_with_insight("never-built")

    with mock.patch("visivo.commands.deploy_phase.all_descendants_of_type", return_value=[insight]):
        verify_run_output(project, str(tmp_path))  # does not raise


def test_verify_run_output_rejects_a_missing_run_directory(tmp_path):
    """The trap the user hit: `deploy` before `run`. deploy uploads what the run
    wrote and never runs itself, so a run directory that isn't there means zero
    data uploaded — but the per-envelope checks skip missing envelopes and the
    deploy 'succeeds' empty. A project with insights but no run directory is that
    trap, so it must fail loudly instead."""
    missing_dir = os.path.join(str(tmp_path), "main")  # never created — no run happened
    project, insight = _project_with_insight()

    with mock.patch("visivo.commands.deploy_phase.all_descendants_of_type", return_value=[insight]):
        with pytest.raises(click.ClickException) as exc:
            verify_run_output(project, missing_dir)

    assert "visivo run" in str(exc.value)


def test_verify_run_output_allows_a_missing_directory_with_nothing_to_build(tmp_path):
    """A project with no insights or inputs has no run data to upload, so an
    absent run directory is not the trap — deploy of a markdown-only project that
    was never run should not be forced through a pointless build."""
    missing_dir = os.path.join(str(tmp_path), "main")
    project = mock.Mock(inputs=[])
    project.dag = lambda: mock.Mock()

    with mock.patch("visivo.commands.deploy_phase.all_descendants_of_type", return_value=[]):
        verify_run_output(project, missing_dir)  # does not raise


def test_verify_run_output_stays_short_by_default(tmp_path, monkeypatch):
    """The list is diagnostic, not a to-do — the reader acts on the remedy, not
    on individual paths. Long output here reads as a wall of noise."""
    monkeypatch.delenv("STACKTRACE", raising=False)
    _envelope(
        os.path.join(str(tmp_path), "insights"),
        "line-trace",
        f"{tmp_path}/files/line-trace.parquet",
    )
    project, insight = _project_with_insight()

    with mock.patch("visivo.commands.deploy_phase.all_descendants_of_type", return_value=[insight]):
        with pytest.raises(click.ClickException) as exc:
            verify_run_output(project, str(tmp_path))

    message = str(exc.value)
    assert "visivo run" in message
    assert "STACKTRACE=true" in message
    assert "line-trace.parquet" not in message


def test_verify_run_output_lists_them_under_stacktrace(tmp_path, monkeypatch):
    monkeypatch.setenv("STACKTRACE", "true")
    _envelope(
        os.path.join(str(tmp_path), "insights"),
        "line-trace",
        f"{tmp_path}/files/line-trace.parquet",
    )
    project, insight = _project_with_insight()

    with mock.patch("visivo.commands.deploy_phase.all_descendants_of_type", return_value=[insight]):
        with pytest.raises(click.ClickException) as exc:
            verify_run_output(project, str(tmp_path))

    assert "line-trace.parquet" in str(exc.value)
