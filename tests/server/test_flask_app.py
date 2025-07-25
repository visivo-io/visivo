import io
from pathlib import Path
import tempfile
from unittest import mock
from unittest.mock import MagicMock
import pytest
import json
import os
from visivo.server.flask_app import FlaskApp
from visivo.server.repositories.worksheet_repository import WorksheetRepository
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
    # Create a project with a SQLite source
    source = SourceFactory(database=f"{output_dir}/test.sqlite")
    project = ProjectFactory(sources=[source])

    # Create SQLite database
    create_file_database(url=source.url(), output_dir=output_dir)

    # Create the Flask app with output_dir as static_folder
    app = FlaskApp(output_dir, project)
    app.app.config["TESTING"] = True
    return app.app


@pytest.fixture
def client(app):
    """Create a test client."""
    return app.test_client()


@pytest.fixture
def worksheet_repo(app, output_dir):
    """Get the worksheet repository from the app."""
    # Ensure the directory exists
    os.makedirs(output_dir, exist_ok=True)
    db_path = os.path.join(output_dir, "worksheets.db")
    return WorksheetRepository(db_path)


def test_create_worksheet(client):
    """Test POST /api/worksheet endpoint."""
    response = client.post(
        "/api/worksheet",
        json={
            "name": "Test Worksheet",
            "query": "SELECT * FROM test",
            "selected_source": "test_source",
        },
    )
    assert response.status_code == 201
    data = json.loads(response.data)
    assert data["worksheet"]["name"] == "Test Worksheet"
    assert data["worksheet"]["query"] == "SELECT * FROM test"
    assert data["worksheet"]["selected_source"] == "test_source"
    assert data["session_state"]["tab_order"] == 1
    assert data["session_state"]["is_visible"] is True


def test_create_worksheet_without_name(client):
    """Test POST /api/worksheet endpoint with missing name."""
    response = client.post("/api/worksheet", json={"query": "SELECT * FROM test"})
    assert response.status_code == 400
    data = json.loads(response.data)
    assert "Name is required" in data["message"]


def test_get_worksheet(client, worksheet_repo):
    """Test GET /api/worksheet/<id> endpoint."""
    # Create a worksheet first
    result = worksheet_repo.create_worksheet(name="Test Worksheet", query="SELECT * FROM test")
    worksheet_id = result["worksheet"]["id"]

    # Test retrieval
    response = client.get(f"/api/worksheet/{worksheet_id}")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["worksheet"]["id"] == worksheet_id
    assert data["worksheet"]["name"] == "Test Worksheet"
    assert data["worksheet"]["query"] == "SELECT * FROM test"


def test_get_nonexistent_worksheet(client):
    """Test GET /api/worksheet/<id> with non-existent ID."""
    response = client.get("/api/worksheet/nonexistent-id")
    assert response.status_code == 404


def test_list_worksheets(client, worksheet_repo):
    """Test GET /api/worksheet endpoint."""
    # Create some worksheets
    worksheet_repo.create_worksheet(name="Worksheet 1")
    worksheet_repo.create_worksheet(name="Worksheet 2")
    worksheet_repo.create_worksheet(name="Worksheet 3")

    # Test listing
    response = client.get("/api/worksheet")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert len(data) == 3
    assert data[0]["worksheet"]["name"] == "Worksheet 1"
    assert data[1]["worksheet"]["name"] == "Worksheet 2"
    assert data[2]["worksheet"]["name"] == "Worksheet 3"


def test_update_worksheet(client, worksheet_repo):
    """Test PUT /api/worksheet/<id> endpoint."""
    # Create a worksheet first
    result = worksheet_repo.create_worksheet(name="Original Name")
    worksheet_id = result["worksheet"]["id"]

    # Test update
    response = client.put(
        f"/api/worksheet/{worksheet_id}",
        json={"name": "Updated Name", "query": "SELECT * FROM updated"},
    )
    assert response.status_code == 200

    # Verify changes
    updated = worksheet_repo.get_worksheet(worksheet_id)
    assert updated["worksheet"]["name"] == "Updated Name"
    assert updated["worksheet"]["query"] == "SELECT * FROM updated"


def test_update_nonexistent_worksheet(client):
    """Test PUT /api/worksheet/<id> with non-existent ID."""
    response = client.put("/api/worksheet/nonexistent-id", json={"name": "New Name"})
    assert response.status_code == 404


def test_delete_worksheet(client, worksheet_repo):
    """Test DELETE /api/worksheet/<id> endpoint."""
    # Create a worksheet first
    result = worksheet_repo.create_worksheet(name="Test Worksheet")
    worksheet_id = result["worksheet"]["id"]

    # Test deletion
    response = client.delete(f"/api/worksheet/{worksheet_id}")
    assert response.status_code == 200

    # Verify deletion
    assert worksheet_repo.get_worksheet(worksheet_id) is None


def test_delete_nonexistent_worksheet(client):
    """Test DELETE /api/worksheet/<id> with non-existent ID."""
    response = client.delete("/api/worksheet/nonexistent-id")
    assert response.status_code == 404


def test_get_session_state(client, worksheet_repo):
    """Test GET /api/worksheet/session endpoint."""
    # Create worksheets with different session states
    worksheet_repo.create_worksheet(name="Worksheet 1")
    worksheet_repo.create_worksheet(name="Worksheet 2")

    # Test getting session states
    response = client.get("/api/worksheet/session")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert len(data) == 2
    assert data[0]["tab_order"] == 1
    assert data[1]["tab_order"] == 2


def test_update_session_state(client, worksheet_repo):
    """Test PUT /api/worksheet/session endpoint."""
    # Create worksheets
    w1 = worksheet_repo.create_worksheet(name="Worksheet 1")
    w2 = worksheet_repo.create_worksheet(name="Worksheet 2")

    # Test updating session states
    response = client.put(
        "/api/worksheet/session",
        json=[
            {"worksheet_id": w1["worksheet"]["id"], "tab_order": 2, "is_visible": False},
            {"worksheet_id": w2["worksheet"]["id"], "tab_order": 1, "is_visible": True},
        ],
    )
    assert response.status_code == 200

    # Verify changes
    worksheets = worksheet_repo.list_worksheets()
    assert worksheets[0]["worksheet"]["name"] == "Worksheet 2"
    assert worksheets[0]["session_state"]["tab_order"] == 1
    assert worksheets[1]["worksheet"]["name"] == "Worksheet 1"
    assert worksheets[1]["session_state"]["tab_order"] == 2


def test_update_session_state_invalid_data(client):
    """Test PUT /api/worksheet/session with invalid data."""
    response = client.put("/api/worksheet/session", json={"not": "a list"})
    assert response.status_code == 400
    data = json.loads(response.data)
    assert "Expected array of session states" in data["message"]


def test_execute_query_with_worksheet(client, worksheet_repo, mocker):
    """Test POST /api/query/<project_id> with worksheet_id."""
    # Create a worksheet
    result = worksheet_repo.create_worksheet(
        name="Test Worksheet",
        query="SELECT * FROM test_table",
        selected_source="source",  # This matches the source name from SourceFactory
    )
    worksheet_id = result["worksheet"]["id"]

    # Test query execution
    response = client.post(
        "/api/query/test-project",
        json={
            "query": "SELECT * FROM test_table",
            "source": "source",
            "worksheet_id": worksheet_id,
        },
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert "columns" in data
    assert "rows" in data

    # Verify results were saved
    worksheet = worksheet_repo.get_worksheet(worksheet_id)
    assert worksheet["results"] is not None


def test_execute_query_source_fallback(client, worksheet_repo):
    """Test POST /api/query/<project_id> with invalid source falls back to available source.

    The execute_query endpoint has a fallback mechanism:
    1. Try to use the requested source
    2. If not found, try to use the project's default source
    3. If no default, use the first available source
    4. Only fail if no sources are available
    """
    # Create a worksheet
    result = worksheet_repo.create_worksheet(
        name="Test Worksheet",
        query="SELECT * FROM test_table",
        selected_source="nonexistent_source",
    )
    worksheet_id = result["worksheet"]["id"]

    # Test query execution with non-existent source
    response = client.post(
        "/api/query/test-project",
        json={
            "query": "SELECT * FROM test_table",
            "source": "nonexistent_source",
            "worksheet_id": worksheet_id,
        },
    )
    # Should succeed by falling back to the available source
    assert response.status_code == 200
    data = json.loads(response.data)
    assert "columns" in data
    assert "rows" in data

    # Verify results were saved
    worksheet = worksheet_repo.get_worksheet(worksheet_id)
    assert worksheet["results"] is not None


def test_execute_query_no_sources(client, worksheet_repo):
    """Test POST /api/query/<project_id> when no sources are available."""
    # Create a worksheet
    result = worksheet_repo.create_worksheet(
        name="Test Worksheet", query="SELECT * FROM test_table"
    )
    worksheet_id = result["worksheet"]["id"]

    # Create a new app instance with a minimal project (no sources, no models, no dashboards)
    minimal_project = ProjectFactory(
        sources=[],
        dashboards=[],  # Override default dashboard creation
        models=[],  # Override default model creation
        traces=[],  # Ensure no traces
        charts=[],  # Ensure no charts
        tables=[],  # Ensure no tables
    )

    # Ensure the output directory exists for the new app instance
    new_output_dir = os.path.join(client.application.static_folder, "no_sources_test")
    os.makedirs(new_output_dir, exist_ok=True)

    # Create the Flask app with the new output directory
    app = FlaskApp(new_output_dir, minimal_project)
    test_client = app.app.test_client()

    # Test query execution with no available sources
    response = test_client.post(
        "/api/query/test-project",
        json={"query": "SELECT * FROM test_table", "worksheet_id": worksheet_id},
    )
    assert response.status_code == 400
    data = json.loads(response.data)
    assert "No source configured" in data["message"]


def test_execute_query_invalid_sql(client, worksheet_repo, capsys):
    """Test POST /api/query/<project_id> with invalid SQL."""
    # Create a worksheet
    result = worksheet_repo.create_worksheet(
        name="Test Worksheet", query="INVALID SQL", selected_source="source"
    )
    worksheet_id = result["worksheet"]["id"]

    # Test query execution with invalid SQL
    response = client.post(
        "/api/query/test-project",
        json={"query": "INVALID SQL", "source": "source", "worksheet_id": worksheet_id},
    )
    assert response.status_code == 500
    data = json.loads(response.data)
    captured = capsys.readouterr()
    assert "sqlite3.OperationalError" in data["message"]
    assert "Query execution error" in captured.out


def test_missing_project_name(client):
    """Test POST /api/project/init when project name is missing."""
    res = client.post("/api/project/init", json={"project_dir": "/tmp/somepath"})
    assert res.status_code == 400
    assert b"Project name is required" in res.data


def test_create_project_with_file_upload(client):
    """Test POST /api/source/upload with a CSV file upload."""
    with tempfile.TemporaryDirectory() as tmpdir:
        dummy_csv = io.BytesIO(b"col1,col2\n1,2\n3,4")
        dummy_csv.filename = "test.csv"

        res = client.post(
            "/api/source/upload",
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
            "/api/source/create",
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

    mock_repo = mock.MagicMock()
    monkeypatch.setattr("visivo.server.views.project_views.Repo.clone_from", mock_repo)

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
        "/api/project/load_example",
        data=json.dumps(payload),
        content_type="application/json",
    )

    # Assert successful project load
    assert response.status_code == 200
    assert response.get_json()["message"] == "Project created successfully"
