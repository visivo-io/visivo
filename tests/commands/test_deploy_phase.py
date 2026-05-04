import os
import json

from tests.factories.model_factories import (
    ProjectFactory,
    InputFactory,
    InsightFactory,
)
from tests.support.utils import temp_file, temp_folder, temp_yml_file
from visivo.commands.deploy_phase import deploy_phase
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
    )
    captured = capsys.readouterr()
    stdout = captured.out
    assert "/url" == url
    assert "Processing insight uploads..." in stdout
    assert "Processing input uploads..." in stdout
    assert "Processing model uploads..." in stdout
    assert "Deployment completed in" in stdout
