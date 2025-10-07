import os
import json

import click
from tests.factories.model_factories import ProjectFactory, TraceFactory
from tests.support.utils import temp_file, temp_folder, temp_yml_file
from visivo.commands.deploy_phase import deploy_phase
from visivo.parsers.file_names import PROFILE_FILE_NAME, PROJECT_FILE_NAME
from pytest import raises

from visivo.utils import sanitize_filename


def test_deploy_upload_trace_data_failure(requests_mock, capsys):
    output_dir = temp_folder()
    project = ProjectFactory()
    # create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    project.dashboards[0].rows[0].items[0].chart.traces.append(
        TraceFactory(name="trace-two", model="ref(model)")
    )
    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)
    temp_file(PROFILE_FILE_NAME, "token: value", working_dir + "/.visivo")

    requests_mock.post(
        "http://host/api/projects/",
        json={"name": "name", "id": "id", "url": "/url"},
        status_code=201,
    )

    with raises(click.ClickException) as exc_info:
        deploy_phase(
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
    assert "[Attempt 1/3] Failed to create trace files" in stdout
    assert "[Attempt 2/3] Failed to create trace files" in stdout
    assert "[Attempt 3/3] Failed to create trace files" in stdout
    assert "Processing trace uploads and record creations..." in stdout


def test_deploy_success(requests_mock, httpx_mock, capsys):
    output_dir = temp_folder()
    project = ProjectFactory()
    data_file_starts = [
        {
            "name": "trace.json",
            "id": "id1",
            "upload_url": "http://google/upload/id1",
        },
    ]
    sanitized_name = sanitize_filename(project.dashboards[0].name)
    thumbnail_file_starts = [
        {
            "name": f"{sanitized_name}.png",
            "id": "id3",
            "upload_url": "http://google/upload/id3",
        },
    ]

    # create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    project.traces.append(TraceFactory(name="trace-two", model="ref(model)"))
    for trace in ["trace", "trace-two"]:
        data_file = os.path.join(output_dir, "traces", trace, "data.json")
        os.makedirs(os.path.dirname(data_file), exist_ok=True)
        with open(data_file, "w") as f:
            json.dump({trace: {"x": [1, 2, 3], "y": [1, 2, 3]}}, f)

    os.makedirs(os.path.join(output_dir, "dashboards"), exist_ok=True)
    thumbnail_path = os.path.join(output_dir, "dashboards", f"{sanitized_name}.png")
    with open(thumbnail_path, "wb") as f:
        f.write(b"dummy data")

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)
    temp_file(PROFILE_FILE_NAME, "token: value", working_dir + "/.visivo")

    httpx_mock.add_response(
        method="POST",
        url="http://host/api/files/direct/start/",
        json=data_file_starts,
    )
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/files/direct/start/",
        json=thumbnail_file_starts,
    )
    httpx_mock.add_response(
        method="PUT",
        url="http://google/upload/id1",
        status_code=200,
    )
    httpx_mock.add_response(
        method="PUT",
        url="http://google/upload/id3",
        status_code=200,
    )
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/files/direct/finish/",
        status_code=204,
    )
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/files/direct/finish/",
        status_code=204,
    )
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/traces/",
        json=[{"id": "id1"}, {"id": "id2"}],
        status_code=201,
    )
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/dashboards/",
        json=[{"id": "id3"}],
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
    assert "Processing trace uploads and record creations..." in stdout
    assert "Deployment completed in" in stdout
    assert stdout.count("Skipping") == 0
    assert stdout.count("[4/4]") == 2


def test_deploy_with_insights_success(requests_mock, httpx_mock, capsys):
    """Test deployment with insights uploads data files and creates insight records"""
    output_dir = temp_folder()
    project = ProjectFactory()

    # Setup insight data files
    from tests.factories.model_factories import InsightFactory

    insight1 = InsightFactory(name="sales_chart")
    insight2 = InsightFactory(name="revenue_chart")
    project.insights = [insight1, insight2]

    # Create insight.json files
    for insight in ["sales_chart", "revenue_chart"]:
        insight_file = os.path.join(output_dir, "insights", insight, "insight.json")
        os.makedirs(os.path.dirname(insight_file), exist_ok=True)
        with open(insight_file, "w") as f:
            json.dump(
                {
                    "data": [{"x": 1, "y": 2}, {"x": 2, "y": 3}],
                    "metadata": {"columns": {}, "props": {}},
                    "post_query": f'SELECT * FROM "{insight}"',
                },
                f,
            )

    # Setup trace data files (existing test setup)
    project.traces.append(TraceFactory(name="trace-two", model="ref(model)"))
    for trace in ["trace", "trace-two"]:
        data_file = os.path.join(output_dir, "traces", trace, "data.json")
        os.makedirs(os.path.dirname(data_file), exist_ok=True)
        with open(data_file, "w") as f:
            json.dump({trace: {"x": [1, 2, 3], "y": [1, 2, 3]}}, f)

    # Dashboard thumbnail
    sanitized_name = sanitize_filename(project.dashboards[0].name)
    os.makedirs(os.path.join(output_dir, "dashboards"), exist_ok=True)
    thumbnail_path = os.path.join(output_dir, "dashboards", f"{sanitized_name}.png")
    with open(thumbnail_path, "wb") as f:
        f.write(b"dummy data")

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)
    temp_file(PROFILE_FILE_NAME, "token: value", working_dir + "/.visivo")

    # Mock file upload responses for traces
    trace_file_starts = [
        {"name": "trace.json", "id": "trace_id1", "upload_url": "http://google/upload/trace1"},
    ]

    # Mock file upload responses for insights
    insight_file_starts = [
        {
            "name": "sales_chart.json",
            "id": "insight_id1",
            "upload_url": "http://google/upload/insight1",
        },
        {
            "name": "revenue_chart.json",
            "id": "insight_id2",
            "upload_url": "http://google/upload/insight2",
        },
    ]

    # Mock file upload responses for dashboard
    thumbnail_file_starts = [
        {
            "name": f"{sanitized_name}.png",
            "id": "dashboard_id1",
            "upload_url": "http://google/upload/dashboard1",
        },
    ]

    # Setup httpx mocks in order of expected calls
    httpx_mock.add_response(
        method="POST", url="http://host/api/files/direct/start/", json=trace_file_starts
    )
    httpx_mock.add_response(method="PUT", url="http://google/upload/trace1", status_code=200)
    httpx_mock.add_response(
        method="POST", url="http://host/api/files/direct/finish/", status_code=204
    )

    httpx_mock.add_response(
        method="POST", url="http://host/api/files/direct/start/", json=insight_file_starts
    )
    httpx_mock.add_response(method="PUT", url="http://google/upload/insight1", status_code=200)
    httpx_mock.add_response(method="PUT", url="http://google/upload/insight2", status_code=200)
    httpx_mock.add_response(
        method="POST", url="http://host/api/files/direct/finish/", status_code=204
    )

    httpx_mock.add_response(
        method="POST", url="http://host/api/files/direct/start/", json=thumbnail_file_starts
    )
    httpx_mock.add_response(method="PUT", url="http://google/upload/dashboard1", status_code=200)
    httpx_mock.add_response(
        method="POST", url="http://host/api/files/direct/finish/", status_code=204
    )

    # Mock record creation endpoints
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/traces/",
        json=[{"id": "trace_rec1"}, {"id": "trace_rec2"}],
        status_code=201,
    )
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/insights/",
        json=[{"id": "insight_rec1"}, {"id": "insight_rec2"}],
        status_code=201,
    )
    httpx_mock.add_response(
        method="POST",
        url="http://host/api/dashboards/",
        json=[{"id": "dashboard_rec1"}],
        status_code=201,
    )

    requests_mock.post(
        "http://host/api/projects/",
        json={"name": "name", "id": "proj_id", "url": "/project_url"},
        status_code=201,
    )
    requests_mock.put(
        "http://host/api/projects/proj_id/",
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

    assert "/project_url" == url
    assert "Processing trace uploads and record creations..." in stdout
    assert "Processing insight uploads and record creations..." in stdout
    assert "Deployment completed in" in stdout
    assert stdout.count("Skipping") == 0


def test_deploy_insight_upload_failure(requests_mock, httpx_mock, capsys):
    """Test that deployment handles insight upload failures gracefully"""
    output_dir = temp_folder()

    from tests.factories.model_factories import InsightFactory, SourceFactory

    # Create a minimal project with only insights (no traces/dashboards)
    project = ProjectFactory(dashboards=[], traces=[], charts=[], tables=[])
    insight1 = InsightFactory(name="failing_insight")
    project.insights = [insight1]

    # Create insight.json file
    insight_file = os.path.join(output_dir, "insights", "failing_insight", "insight.json")
    os.makedirs(os.path.dirname(insight_file), exist_ok=True)
    with open(insight_file, "w") as f:
        json.dump(
            {
                "data": [{"x": 1, "y": 2}],
                "metadata": {"columns": {}, "props": {}},
                "post_query": 'SELECT * FROM "failing_insight"',
            },
            f,
        )

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)
    temp_file(PROFILE_FILE_NAME, "token: value", working_dir + "/.visivo")

    requests_mock.post(
        "http://host/api/projects/",
        json={"name": "name", "id": "id", "url": "/url"},
        status_code=201,
    )

    # Mock insight file upload to fail for all retry attempts
    for _ in range(3):  # Mock all 3 retry attempts
        httpx_mock.add_response(
            method="POST",
            url="http://host/api/files/direct/start/",
            status_code=500,  # Server error
        )

    with raises(click.ClickException) as exc_info:
        deploy_phase(
            stage="stage",
            working_dir=working_dir,
            user_dir=working_dir,
            output_dir=output_dir,
            host="http://host",
        )

    captured = capsys.readouterr()
    stdout = captured.out
    assert "Processing insight uploads and record creations..." in stdout
    assert "Failed to create insight files" in stdout
