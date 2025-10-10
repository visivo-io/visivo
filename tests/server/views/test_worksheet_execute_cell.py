"""Tests for execute_cell endpoint in worksheet views."""

import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from visivo.server.flask_app import FlaskApp
from visivo.models.project import Project


@pytest.fixture
def flask_app_with_worksheets(tmp_path):
    """Create a Flask app with worksheet repository for testing."""
    # Create a minimal project
    project_dict = {
        "name": "test_project",
        "sources": [
            {
                "type": "duckdb",
                "name": "test_source",
                "database": ":memory:",
            }
        ],
    }
    project = Project.model_validate(project_dict)

    # Create Flask app
    output_dir = str(tmp_path / "output")
    import os

    os.makedirs(output_dir, exist_ok=True)

    app = FlaskApp(output_dir, project)
    app.app.config["TESTING"] = True

    # Create a test worksheet with a cell
    worksheet_result = app.worksheet_repo.create_worksheet(name="Test Worksheet")

    # Update the initial cell with a query and source
    cell_id = worksheet_result["cells"][0]["id"]
    app.worksheet_repo.update_cell(
        cell_id, {"query_text": "SELECT 1 as col", "selected_source": "test_source"}
    )

    # Refresh the worksheet result to include updated cell
    worksheet_result["cells"] = app.worksheet_repo.list_cells(
        worksheet_result["worksheet"]["id"]
    )

    yield app, worksheet_result


@pytest.fixture
def mock_query_service():
    """Mock the query execution service to avoid actual database connections."""
    with patch("visivo.server.views.worksheet_views.execute_query_on_source") as mock_exec:
        # Default return value
        mock_exec.return_value = {
            "columns": ["col"],
            "rows": [{"col": 1}],
            "is_truncated": False,
            "execution_time": 0.1,
            "source_name": "test_source",
        }
        yield mock_exec


class TestExecuteCellEndpoint:
    """Tests for the /api/worksheet/<worksheet_id>/cells/<cell_id>/execute/ endpoint."""

    def test_execute_cell_returns_results(self, flask_app_with_worksheets, mock_query_service):
        """Test that executing a cell returns query results."""
        app, worksheet_result = flask_app_with_worksheets
        worksheet_id = worksheet_result["worksheet"]["id"]
        cell_id = worksheet_result["cells"][0]["id"]

        # Update cell with a query
        app.worksheet_repo.update_cell(cell_id, {"query_text": "SELECT 42 as answer"})

        with app.app.test_client() as client:
            response = client.post(f"/api/worksheet/{worksheet_id}/cells/{cell_id}/execute/")

            assert response.status_code == 200
            data = json.loads(response.data)

            assert "columns" in data
            assert "rows" in data
            assert "is_truncated" in data
            assert "query_stats" in data
            assert data["is_truncated"] is False

    def test_execute_cell_saves_results_to_database(
        self, flask_app_with_worksheets, mock_query_service
    ):
        """Test that cell results are saved to the database."""
        app, worksheet_result = flask_app_with_worksheets
        worksheet_id = worksheet_result["worksheet"]["id"]
        cell_id = worksheet_result["cells"][0]["id"]

        # Update cell with a query
        app.worksheet_repo.update_cell(cell_id, {"query_text": "SELECT 1 as col"})

        with app.app.test_client() as client:
            response = client.post(f"/api/worksheet/{worksheet_id}/cells/{cell_id}/execute/")
            assert response.status_code == 200

        # Verify results were saved
        cell_data = app.worksheet_repo.get_cell(cell_id)
        assert cell_data is not None
        assert cell_data["result"] is not None
        assert "results_json" in cell_data["result"]
        assert "query_stats_json" in cell_data["result"]

    def test_execute_cell_returns_error_for_invalid_sql(
        self, flask_app_with_worksheets, mock_query_service
    ):
        """Test that invalid SQL returns an error."""
        app, worksheet_result = flask_app_with_worksheets
        worksheet_id = worksheet_result["worksheet"]["id"]
        cell_id = worksheet_result["cells"][0]["id"]

        # Mock query service to raise an error
        mock_query_service.side_effect = Exception("SQL syntax error")

        # Update cell with invalid SQL
        app.worksheet_repo.update_cell(cell_id, {"query_text": "INVALID SQL SYNTAX"})

        with app.app.test_client() as client:
            response = client.post(f"/api/worksheet/{worksheet_id}/cells/{cell_id}/execute/")

            # Should return 500 error for SQL execution failure
            assert response.status_code == 500
            data = json.loads(response.data)
            assert "message" in data

    def test_execute_cell_returns_error_for_empty_query(self, flask_app_with_worksheets):
        """Test that executing an empty query returns an error."""
        app, worksheet_result = flask_app_with_worksheets
        worksheet_id = worksheet_result["worksheet"]["id"]
        cell_id = worksheet_result["cells"][0]["id"]

        # Update cell with empty query
        app.worksheet_repo.update_cell(cell_id, {"query_text": ""})

        with app.app.test_client() as client:
            response = client.post(f"/api/worksheet/{worksheet_id}/cells/{cell_id}/execute/")

            assert response.status_code == 400
            data = json.loads(response.data)
            assert "message" in data
            assert "no query" in data["message"].lower()

    def test_execute_cell_returns_404_for_invalid_cell_id(self, flask_app_with_worksheets):
        """Test that executing a non-existent cell returns 404."""
        app, worksheet_result = flask_app_with_worksheets
        worksheet_id = worksheet_result["worksheet"]["id"]

        with app.app.test_client() as client:
            response = client.post(f"/api/worksheet/{worksheet_id}/cells/invalid-cell-id/execute/")

            assert response.status_code == 404
            data = json.loads(response.data)
            assert "message" in data

    def test_execute_cell_returns_404_for_invalid_worksheet_id(self, flask_app_with_worksheets):
        """Test that executing a cell for a non-existent worksheet returns 404."""
        app, worksheet_result = flask_app_with_worksheets
        cell_id = worksheet_result["cells"][0]["id"]

        with app.app.test_client() as client:
            response = client.post(f"/api/worksheet/invalid-worksheet-id/cells/{cell_id}/execute/")

            assert response.status_code == 404
            data = json.loads(response.data)
            assert "message" in data

    def test_execute_cell_includes_execution_time(
        self, flask_app_with_worksheets, mock_query_service
    ):
        """Test that query stats include execution time."""
        app, worksheet_result = flask_app_with_worksheets
        worksheet_id = worksheet_result["worksheet"]["id"]
        cell_id = worksheet_result["cells"][0]["id"]

        app.worksheet_repo.update_cell(cell_id, {"query_text": "SELECT 1 as col"})

        with app.app.test_client() as client:
            response = client.post(f"/api/worksheet/{worksheet_id}/cells/{cell_id}/execute/")

            assert response.status_code == 200
            data = json.loads(response.data)

            assert "query_stats" in data
            assert "executionTime" in data["query_stats"]
            assert isinstance(data["query_stats"]["executionTime"], (int, float))

    def test_execute_cell_includes_source_name(self, flask_app_with_worksheets, mock_query_service):
        """Test that query stats include source name."""
        app, worksheet_result = flask_app_with_worksheets
        worksheet_id = worksheet_result["worksheet"]["id"]
        cell_id = worksheet_result["cells"][0]["id"]

        app.worksheet_repo.update_cell(cell_id, {"query_text": "SELECT 1 as col"})

        with app.app.test_client() as client:
            response = client.post(f"/api/worksheet/{worksheet_id}/cells/{cell_id}/execute/")

            assert response.status_code == 200
            data = json.loads(response.data)

            assert "query_stats" in data
            assert "source" in data["query_stats"]
            assert data["query_stats"]["source"] == "test_source"

    def test_execute_cell_handles_truncation(self, flask_app_with_worksheets, mock_query_service):
        """Test that truncation flag is properly handled."""
        app, worksheet_result = flask_app_with_worksheets
        worksheet_id = worksheet_result["worksheet"]["id"]
        cell_id = worksheet_result["cells"][0]["id"]

        # Mock truncated results
        mock_query_service.return_value = {
            "columns": ["col"],
            "rows": [{"col": i} for i in range(100000)],
            "is_truncated": True,
            "execution_time": 0.5,
            "source_name": "test_source",
        }

        app.worksheet_repo.update_cell(cell_id, {"query_text": "SELECT * FROM large_table"})

        with app.app.test_client() as client:
            response = client.post(f"/api/worksheet/{worksheet_id}/cells/{cell_id}/execute/")

            assert response.status_code == 200
            data = json.loads(response.data)

            assert data["is_truncated"] is True
            assert len(data["rows"]) == 100000

    def test_execute_cell_uses_cell_source(self, flask_app_with_worksheets, mock_query_service):
        """Test that execute_cell uses the cell's selected source."""
        app, worksheet_result = flask_app_with_worksheets
        worksheet_id = worksheet_result["worksheet"]["id"]
        cell_id = worksheet_result["cells"][0]["id"]

        # Verify cell has the correct source
        cell_data = app.worksheet_repo.get_cell(cell_id)
        assert cell_data["cell"]["selected_source"] == "test_source"

        with app.app.test_client() as client:
            response = client.post(f"/api/worksheet/{worksheet_id}/cells/{cell_id}/execute/")

            assert response.status_code == 200
            data = json.loads(response.data)
            assert data["query_stats"]["source"] == "test_source"
