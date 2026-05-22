import os
import json
import tarfile

from tests.factories.model_factories import (
    ProjectFactory,
    InputFactory,
    InsightFactory,
)
from tests.support.utils import temp_file, temp_folder, temp_yml_file
from visivo.commands.deploy_phase import (
    deploy_phase,
    _build_source_tarball,
    _upload_source_tarball,
    SOURCE_TARBALL_MAX_FILE_BYTES,
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
        skip_source_upload=True,
    )
    captured = capsys.readouterr()
    stdout = captured.out
    assert "/url" == url
    assert "Processing insight uploads..." in stdout
    assert "Processing input uploads..." in stdout
    assert "Processing model uploads..." in stdout
    assert "Deployment completed in" in stdout


def _write(path, content=b"x"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mode = "wb" if isinstance(content, bytes) else "w"
    with open(path, mode) as f:
        f.write(content)


def test_build_source_tarball_includes_yaml_python_and_sql():
    working_dir = temp_folder()
    output_dir = temp_folder()
    _write(os.path.join(working_dir, PROJECT_FILE_NAME), "name: t\n")
    _write(os.path.join(working_dir, "models", "thing.sql"), "select 1")
    _write(os.path.join(working_dir, "script_models", "fetch.py"), "print('hi')")
    _write(os.path.join(working_dir, "data", "static.csv"), "a,b\n1,2\n")

    tarball, skipped = _build_source_tarball(working_dir=working_dir, output_dir=output_dir)
    assert skipped == []
    with tarfile.open(tarball, "r:gz") as tar:
        names = set(tar.getnames())
    assert PROJECT_FILE_NAME in names
    assert "models/thing.sql" in names
    assert "script_models/fetch.py" in names
    assert "data/static.csv" in names


def test_build_source_tarball_excludes_known_dirs_and_artifact_files():
    working_dir = temp_folder()
    output_dir = temp_folder()
    _write(os.path.join(working_dir, PROJECT_FILE_NAME), "name: t\n")
    # Excluded directories — must not be walked into.
    _write(os.path.join(working_dir, ".git", "HEAD"), "ref")
    _write(os.path.join(working_dir, "target", "out.json"), "{}")
    _write(os.path.join(working_dir, ".visivo_cache", "dep", "p.yml"), "x: 1")
    _write(os.path.join(working_dir, "__pycache__", "m.cpython-312.pyc"), b"\x00")
    _write(os.path.join(working_dir, "node_modules", "lib", "x.js"), "// js")
    # Excluded file patterns — must be filtered even outside excluded dirs.
    _write(os.path.join(working_dir, "data", "table.parquet"), b"PAR1")
    _write(os.path.join(working_dir, "data", "warehouse.duckdb"), b"DUCK")
    _write(os.path.join(working_dir, "models", "compiled.pyc"), b"\x00")

    tarball, skipped = _build_source_tarball(working_dir=working_dir, output_dir=output_dir)
    assert skipped == []
    with tarfile.open(tarball, "r:gz") as tar:
        names = set(tar.getnames())

    for excluded in {
        ".git/HEAD",
        "target/out.json",
        ".visivo_cache/dep/p.yml",
        "__pycache__/m.cpython-312.pyc",
        "node_modules/lib/x.js",
        "data/table.parquet",
        "data/warehouse.duckdb",
        "models/compiled.pyc",
    }:
        assert excluded not in names, f"{excluded} should have been excluded"
    assert PROJECT_FILE_NAME in names


def test_build_source_tarball_skips_files_over_max_size():
    working_dir = temp_folder()
    output_dir = temp_folder()
    _write(os.path.join(working_dir, PROJECT_FILE_NAME), "name: t\n")
    big_path = os.path.join(working_dir, "models", "huge.csv")
    _write(big_path, b"x" * (SOURCE_TARBALL_MAX_FILE_BYTES + 1))

    tarball, skipped = _build_source_tarball(working_dir=working_dir, output_dir=output_dir)
    assert len(skipped) == 1
    assert skipped[0][0] == "models/huge.csv"
    assert skipped[0][1] > SOURCE_TARBALL_MAX_FILE_BYTES
    with tarfile.open(tarball, "r:gz") as tar:
        names = set(tar.getnames())
    assert "models/huge.csv" not in names
    assert PROJECT_FILE_NAME in names


def test_build_source_tarball_does_not_include_itself_when_output_in_working_dir():
    working_dir = temp_folder()
    output_dir = os.path.join(working_dir, "target")
    os.makedirs(output_dir, exist_ok=True)
    _write(os.path.join(working_dir, PROJECT_FILE_NAME), "name: t\n")

    tarball, _ = _build_source_tarball(working_dir=working_dir, output_dir=output_dir)
    with tarfile.open(tarball, "r:gz") as tar:
        names = set(tar.getnames())
    # ``target/`` is in the excluded-dirs list, so the tarball (which lives
    # inside ``target/``) cannot end up nested inside itself.
    assert not any(n.endswith("source.tar.gz") for n in names)


def test_upload_source_tarball_happy_path(requests_mock, tmp_path):
    tarball = tmp_path / "source.tar.gz"
    tarball.write_bytes(b"contents")

    requests_mock.post(
        "http://host/api/projects/proj-1/source/",
        json={"id": "src-9", "upload_url": "http://google/upload/src-9"},
        status_code=201,
    )
    requests_mock.put("http://google/upload/src-9", status_code=200)
    requests_mock.post(
        "http://host/api/projects/proj-1/source/src-9/finish/",
        json={"source_artifact_url": "gs://bucket/projects/proj-1/source/abc.tar.gz"},
        status_code=200,
    )

    result = _upload_source_tarball(
        tarball_path=tarball,
        project_id="proj-1",
        json_headers={"content-type": "application/json"},
        form_headers={"Authorization": "Api-Key x"},
        host="http://host",
    )
    assert result == "gs://bucket/projects/proj-1/source/abc.tar.gz"


def test_upload_source_tarball_returns_none_on_endpoint_404(requests_mock, tmp_path, caplog):
    tarball = tmp_path / "source.tar.gz"
    tarball.write_bytes(b"contents")
    requests_mock.post("http://host/api/projects/proj-1/source/", status_code=404)

    result = _upload_source_tarball(
        tarball_path=tarball,
        project_id="proj-1",
        json_headers={"content-type": "application/json"},
        form_headers={"Authorization": "Api-Key x"},
        host="http://host",
    )
    assert result is None


def test_deploy_phase_uploads_source_tarball_by_default(requests_mock, httpx_mock, capsys):
    output_dir = temp_folder()
    project = ProjectFactory()
    project_dict = json.loads(project.model_dump_json())

    tmp = temp_yml_file(dict=project_dict, name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)
    temp_file(PROFILE_FILE_NAME, "token: value", working_dir + "/.visivo")

    requests_mock.post(
        "http://host/api/projects/",
        json={"name": "name", "id": "id", "url": "/url"},
        status_code=201,
    )
    requests_mock.post(
        "http://host/api/projects/id/source/",
        json={"id": "src-1", "upload_url": "http://google/upload/src-1"},
        status_code=201,
    )
    requests_mock.put("http://google/upload/src-1", status_code=200)
    requests_mock.post(
        "http://host/api/projects/id/source/src-1/finish/",
        json={"source_artifact_url": "gs://b/projects/id/source/x.tar.gz"},
        status_code=200,
    )
    requests_mock.put(
        "http://host/api/projects/id/",
        json={"deploy_finished_at": "now"},
        status_code=200,
    )
    # Empty dashboard/insight/input/model pipeline — no httpx mocks needed
    # because the factory project has no thumbnail/insight/input/model files
    # on disk.

    url = deploy_phase(
        stage="stage",
        working_dir=working_dir,
        user_dir=working_dir,
        output_dir=output_dir,
        host="http://host",
    )
    assert url == "/url"

    # Tarball uploaded: start + PUT + finish were all called.
    assert requests_mock.request_history[1].url == "http://host/api/projects/id/source/"
    assert requests_mock.request_history[2].url == "http://google/upload/src-1"
    assert requests_mock.request_history[3].url == "http://host/api/projects/id/source/src-1/finish/"

    stdout = capsys.readouterr().out
    assert "Uploading project source tarball..." in stdout
    assert "Source upload completed" in stdout


def test_deploy_phase_skips_source_upload_when_flag_set(requests_mock, httpx_mock, capsys):
    output_dir = temp_folder()
    project = ProjectFactory()
    project_dict = json.loads(project.model_dump_json())

    tmp = temp_yml_file(dict=project_dict, name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)
    temp_file(PROFILE_FILE_NAME, "token: value", working_dir + "/.visivo")

    requests_mock.post(
        "http://host/api/projects/",
        json={"name": "name", "id": "id", "url": "/url"},
        status_code=201,
    )
    # No source endpoint mocks — if the code calls these the test will fail
    # with an unmatched-request error from requests_mock.
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
        skip_source_upload=True,
    )
    assert url == "/url"
    stdout = capsys.readouterr().out
    assert "Uploading project source tarball..." not in stdout


def test_deploy_phase_gracefully_handles_source_endpoint_404(requests_mock, httpx_mock, capsys):
    output_dir = temp_folder()
    project = ProjectFactory()
    project_dict = json.loads(project.model_dump_json())

    tmp = temp_yml_file(dict=project_dict, name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)
    temp_file(PROFILE_FILE_NAME, "token: value", working_dir + "/.visivo")

    requests_mock.post(
        "http://host/api/projects/",
        json={"name": "name", "id": "id", "url": "/url"},
        status_code=201,
    )
    # Older core: source endpoint not implemented.
    requests_mock.post("http://host/api/projects/id/source/", status_code=404)
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
    assert url == "/url"
    stdout = capsys.readouterr().out
    assert "Uploading project source tarball..." in stdout
    assert "Source upload completed" in stdout
