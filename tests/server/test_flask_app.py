import hashlib
import io
from pathlib import Path
import tempfile
from unittest import mock
from unittest.mock import MagicMock, patch
from urllib.parse import urlencode
import pytest
import json
import os
from visivo.server.flask_app import FlaskApp
from tests.factories.model_factories import ProjectFactory, SourceFactory
from tests.support.utils import temp_folder
from visivo.commands.utils import create_file_database


@pytest.fixture
def output_dir():
    """Create a temporary output directory."""
    return temp_folder()


@pytest.fixture
def app(output_dir):
    """Create a Flask test client with a real project and SQLite database."""
    # Ensure output_dir is absolute to avoid path resolution issues
    abs_output_dir = os.path.abspath(output_dir)

    # Create a project with a SQLite source
    source = SourceFactory(database=f"{abs_output_dir}/test.sqlite")
    project = ProjectFactory(sources=[source])

    # Create SQLite database
    create_file_database(url=source.url(), output_dir=abs_output_dir)

    # Create the Flask app with output_dir as static_folder
    app = FlaskApp(abs_output_dir, project)
    app.app.config["TESTING"] = True
    return app.app


@pytest.fixture
def client(app):
    """Create a test client."""
    return app.test_client()




def test_missing_project_name(client):
    """Test POST /api/project/init when project name is missing."""
    res = client.post("/api/project/init/", json={"project_dir": "/tmp/somepath"})
    assert res.status_code == 400
    assert b"Project name is required" in res.data


def test_create_project_with_file_upload(client):
    """Test POST /api/source/upload with a CSV file upload."""
    with tempfile.TemporaryDirectory() as tmpdir:
        dummy_csv = io.BytesIO(b"col1,col2\n1,2\n3,4")
        dummy_csv.filename = "test.csv"

        res = client.post(
            "/api/source/upload/",
            data={
                "source_type": "csv",
                "source_name": "Uploaded Source",
                "project_dir": tmpdir,
                "file": (dummy_csv, dummy_csv.filename),
            },
            content_type="multipart/form-data",
        )

        assert res.status_code == 200
        data = json.loads(res.data)
        assert data["message"] == "File uploaded"
        assert "dashboard" in data


def test_create_sqlite_project_source_only(client):
    """Test POST /api/source/create with SQLite source."""
    with tempfile.TemporaryDirectory() as tmpdir:
        res = client.post(
            "/api/source/create/",
            data={
                "project_name": "SQLite Project",
                "source_type": "sqlite",
                "source_name": "My SQLite Source",
                "project_dir": tmpdir,
            },
        )
        assert res.status_code == 200
        assert b"Source created" in res.data


def test_load_example_project_success(client, monkeypatch):
    """Test POST /api/project/load_example with a github release clone."""
    # Mock request payload
    payload = {
        "project_name": "demo_project",
        "example_type": "github-releases",
        "project_dir": tempfile.mkdtemp(),
    }

    monkeypatch.setattr("shutil.copy", lambda src, dst: None)
    monkeypatch.setattr("shutil.copy2", lambda src, dst: None)
    monkeypatch.setattr("shutil.copytree", lambda src, dst, dirs_exist_ok=True: None)
    monkeypatch.setattr("shutil.rmtree", lambda path: None)
    monkeypatch.setattr("shutil.move", lambda src, dst: None)

    monkeypatch.setattr(Path, "iterdir", lambda self: iter([]))

    class MockDiscover:
        def __init__(self, **kwargs):
            self.project_file = Path(tempfile.mkdtemp()) / "project.yaml"
            self.project_file.write_text("name: test\n")
            self.files = []

    monkeypatch.setattr("visivo.server.views.project_views.Discover", MockDiscover)

    mock_parser = mock.MagicMock()
    mock_project = mock.MagicMock()
    mock_project.model_copy.return_value = mock_project
    mock_parser.parse.return_value = mock_project

    class MockParserFactory:
        def build(self, project_file, files):
            return mock_parser

    monkeypatch.setattr(
        "visivo.server.views.project_views.ParserFactory", lambda: MockParserFactory()
    )

    # Make the API call
    response = client.post(
        "/api/project/load_example/",
        data=json.dumps(payload),
        content_type="application/json",
    )

    # Assert successful project load
    assert response.status_code == 200
    assert response.get_json()["message"] == "Project created successfully"


def test_authorize_device_token_exists(client):
    """Test POST /api/auth/status check auth status"""
    with patch("visivo.server.views.auth_views.get_existing_token", return_value="test123"):
        response = client.post("/api/auth/status/", json={})
        assert response.status_code == 200
        assert response.get_json()["token"] == "test123"
        assert b"A token already exists in your profile" in response.data


def test_authorize_device_token_does_not_exists(client):
    """Test POST /api/auth/status check auth status"""
    with patch("visivo.server.views.auth_views.get_existing_token", return_value=None):
        response = client.post("/api/auth/status/", json={})
        assert response.status_code == 200
        assert b"UnAuthenticated user access" in response.data


def test_authorize_device_token_browser_full_response(client):
    with (patch("visivo.server.views.auth_views.get_existing_token", return_value=None),):
        response = client.post("/api/auth/authorize-device-token/", json={})
        data = response.get_json()
        assert response.status_code == 200
        assert data["message"] == "Authentication initiated successfully"
        assert "full_url" in data
        assert "auth_id" in data


def test_authorize_device_token_callback_token_missing(client):
    """Test GET /api/auth/authorize-device-token/callback/<auth_id> with missing token"""
    auth_id = "test123"
    response = client.get(f"/api/auth/authorize-device-token/callback/{auth_id}/")

    assert response.status_code == 400
    assert response.get_json()["error"] == "Token not provided"


def test_authorize_device_token_callback_token_valid_token(client):
    with (
        patch("visivo.server.views.auth_views.validate_and_store_token") as mock_store,
        patch(
            "visivo.server.views.auth_views.generate_success_html_response",
            return_value="<html>OK</html>",
        ) as mock_html,
        patch("visivo.server.views.auth_views.Logger.instance") as mock_logger,
        patch("visivo.server.views.auth_views.background_jobs", new_callable=dict),
        patch("visivo.server.views.auth_views.background_jobs_lock"),
    ):

        auth_id = "test123"
        response = client.get(f"/api/auth/authorize-device-token/callback/{auth_id}/?token=test123")

        mock_store.assert_called_once_with("test123")
        mock_html.assert_called_once()

        assert response.status_code == 200
        assert "<html>OK</html>" in response.get_data(as_text=True)


def test_get_cloud_stages_success(client):
    mock_token = "test123"
    mock_res_data = [{"name": "dev"}, {"name": "prod"}]

    with (
        patch("visivo.server.views.cloud_views.get_existing_token", return_value=mock_token),
        patch("visivo.server.views.cloud_views.requests.get") as mock_req,
    ):

        mock_req.return_value.status_code = 200
        mock_req.return_value.json.return_value = mock_res_data

        response = client.get("/api/cloud/stages/")
        data = response.get_json()

        assert response.status_code == 200
        assert data["message"] == "Stages fetched successfully"
        assert data["stages"] == mock_res_data


def test_get_cloud_stages_unauthorized(client):
    mock_token = "test123"
    with (
        patch("visivo.server.views.cloud_views.get_existing_token", return_value=mock_token),
        patch("visivo.server.views.cloud_views.requests.get") as mock_req,
    ):
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.json.return_value = {"message": "UnAuthorized access"}

        mock_req.return_value = mock_response

        response = client.get("/api/cloud/stages/")
        data = response.get_json()

        assert response.status_code == 401
        assert data["message"] == "UnAuthorized access"


def test_create_cloud_stages_success(client):
    mock_token = "test123"
    payload = {"name": "prod"}
    mock_response_data = {"id": 1, "name": "prod"}
    with (
        patch("visivo.server.views.cloud_views.get_existing_token", return_value=mock_token),
        patch("visivo.server.views.cloud_views.requests.post") as mock_post,
    ):
        mock_post.return_value.status_code = 201
        mock_post.return_value.json.return_value = mock_response_data

        headers = {"Authorization": f"Api-Key {mock_token}"}
        response = client.post("/api/cloud/stages/", json=payload, headers=headers)

        data = response.get_json()

        assert response.status_code == 200
        assert data["message"] == "Stages fetched successfully"
        assert data["stage"] == mock_response_data


def test_create_cloud_stages_missing_name(client):
    res = client.post("/api/cloud/stages/", json={})
    data = res.get_json()

    assert res.status_code == 400
    assert data["message"] == "Name is required"


def test_cloud_deploy_success(client):
    with patch("visivo.commands.deploy_phase.deploy_phase") as mock_deploy_phase:
        response = client.post("/api/cloud/deploy/", json={"name": "pre-test"})

        data = response.get_json()
        assert response.status_code == 200
        assert data["message"] == "Deployment initiated successfully"
        mock_deploy_phase.assert_called_once()


def test_get_job_status_valid_id(client):
    """Test GET /api/cloud/job/status/<deploy_id> with valid ID"""
    deploy_id = "test123"
    job_data = {"message": "Deployment complete", "status": 200}

    with (
        patch("visivo.server.views.cloud_views.background_jobs", {deploy_id: job_data}),
        patch("visivo.server.views.cloud_views.background_jobs_lock"),
    ):
        response = client.get(f"/api/cloud/job/status/{deploy_id}/")

    assert response.status_code == 200
    assert response.get_json() == job_data


def test_get_job_status_invalid_id(client):
    """Test GET /api/cloud/job/status/<deploy_id> with invalid ID"""
    deploy_id = "test123"

    with (
        patch("visivo.server.views.cloud_views.background_jobs", {}),
        patch("visivo.server.views.cloud_views.background_jobs_lock"),
    ):
        response = client.get(f"/api/cloud/job/status/{deploy_id}/")

    assert response.status_code == 404
    assert response.get_json()["error"] == "Invalid deploy ID"


def test_serve_insight_data_by_name(client, output_dir):
    """Test serve insight data by name using new endpoint"""
    from visivo.models.base.named_model import alpha_hash

    insight_name = "my_insight"
    run_id = "main"
    name_hash = alpha_hash(insight_name)

    insight_dir = Path(output_dir) / run_id / "insights"
    insight_dir.mkdir(parents=True, exist_ok=True)

    insight_file = insight_dir / f"{name_hash}.json"
    insight_file.write_text(json.dumps({"hello": "world"}))

    resp = client.get(f"/api/insight-jobs/?insight_names={insight_name}&run_id={run_id}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) == 1
    assert data[0]["id"] == insight_name
    assert data[0]["hello"] == "world"


def test_serve_insight_data_by_name_not_found(client):
    """Test serve insight data by name not found"""
    resp = client.get("/api/insight-jobs/?insight_names=unknown&run_id=main")
    assert resp.status_code == 404
    assert "No insight files found" in resp.get_json()["message"]


def test_serve_insight_data_by_name_default_run_id(client, output_dir):
    """Test serve insight data by name defaults to main run when run_id not provided"""
    from visivo.models.base.named_model import alpha_hash

    insight_name = "my_insight"
    name_hash = alpha_hash(insight_name)

    insight_dir = Path(output_dir) / "main" / "insights"
    insight_dir.mkdir(parents=True, exist_ok=True)

    insight_file = insight_dir / f"{name_hash}.json"
    insight_file.write_text(json.dumps({"hello": "world", "default": "run"}))

    resp = client.get(f"/api/insight-jobs/?insight_names={insight_name}")
    assert resp.status_code == 200
    data = resp.get_json()
    assert len(data) == 1
    assert data[0]["id"] == insight_name
    assert data[0]["hello"] == "world"
    assert data[0]["default"] == "run"
