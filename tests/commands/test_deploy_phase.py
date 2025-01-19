import os
import json
from tests.factories.model_factories import ProjectFactory, TraceFactory
from tests.support.utils import temp_file, temp_folder, temp_yml_file
from visivo.commands.deploy_phase import deploy_phase
from visivo.commands.utils import create_file_database
from visivo.parsers.file_names import PROFILE_FILE_NAME, PROJECT_FILE_NAME
from pytest import raises


def test_deploy_upload_trace_data_failure(requests_mock, capsys):
    output_dir = temp_folder()
    project = ProjectFactory()
    # create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    project.traces.append(TraceFactory(name="trace-two", model="ref(model)"))
    tmp = temp_yml_file(
        dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME
    )
    working_dir = os.path.dirname(tmp)
    temp_file(PROFILE_FILE_NAME, "token: value", working_dir + "/.visivo")

    requests_mock.post(
        "http://host/api/projects/",
        json={"name": "name", "id": "id", "url": "/url"},
        status_code=201,
    )

    with raises(SystemExit) as exc_info:
        url = deploy_phase(
            stage="stage",
            working_dir=working_dir,
            user_dir=working_dir,
            output_dir=output_dir,
            host="http://host",
        )
    captured = capsys.readouterr()
    stdout = captured.out
    assert "Uploading project information..." in stdout
    assert "Project uploaded in" in stdout
    assert "[Attempt 2/3] Failed to upload trace data for 'trace-two'" in stdout
    assert "[Attempt 2/3] Failed to upload trace data for 'trace'" in stdout
    assert "Processing trace uploads and record creations..." in stdout
    assert "Deployment failed in" in stdout
    assert stdout.count("Skipping") == 2
    assert stdout.count("Data upload for 'trace") == 2


def test_deploy_success(requests_mock, httpx_mock, capsys):
    output_dir = temp_folder()
    project = ProjectFactory()
    data_file_starts = [
        {
            "name": "trace.json",
            "id": "id1",
            "upload_url": "http://google/upload/id1",
        },
        {
            "name": "trace-two.json",
            "id": "id2",
            "upload_url": "http://google/upload/id2",
        },
    ]

    # create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    project.traces.append(TraceFactory(name="trace-two", model="ref(model)"))
    for trace in ["trace", "trace-two"]:
        data_file = os.path.join(output_dir, trace, "data.json")
        os.makedirs(os.path.dirname(data_file), exist_ok=True)
        with open(data_file, "w") as f:
            json.dump({trace: {"x": [1, 2, 3], "y": [1, 2, 3]}}, f)

    tmp = temp_yml_file(
        dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME
    )
    working_dir = os.path.dirname(tmp)
    temp_file(PROFILE_FILE_NAME, "token: value", working_dir + "/.visivo")

    httpx_mock.add_response(
        method="POST",
        url="http://host/api/files/direct/start/",
        json=data_file_starts,
    )
    httpx_mock.add_response(
        method="PUT",
        url="http://google/upload/id1",
        status_code=200,
    )
    httpx_mock.add_response(
        method="PUT",
        url="http://google/upload/id2",
        status_code=200,
    )
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/files/direct/finish/",
        status_code=204,
    )
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/traces/",
        status_code=201,
    )
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/traces/",
        status_code=201,
    )
    requests_mock.post(
        "http://host/api/projects/",
        json={"name": "name", "id": "id", "url": "/url"},
        status_code=201,
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
    assert "Processing trace uploads and record creations..." in stdout
    assert "Deployment completed in" in stdout
    assert stdout.count("Skipping") == 0
    assert stdout.count("[4/4]") == 1
