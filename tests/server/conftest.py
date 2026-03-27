import os
import pytest
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
def integration_app(output_dir):
    """Create a FlaskApp with a real project and SQLite database.

    This is the shared fixture for integration tests that need a real
    Flask app with working managers (no mocking). Use this instead of
    duplicating FlaskApp setup across test files.
    """
    abs_output_dir = os.path.abspath(output_dir)

    source = SourceFactory(database=f"{abs_output_dir}/test.sqlite")
    project = ProjectFactory(sources=[source])

    create_file_database(url=source.url(), output_dir=abs_output_dir)

    app = FlaskApp(abs_output_dir, project)
    app.app.config["TESTING"] = True
    return app


@pytest.fixture
def integration_client(integration_app):
    """Test client for the integration FlaskApp.

    Use this to make real HTTP requests against Flask endpoints
    with working managers and a real SQLite database.
    """
    return integration_app.app.test_client()


@pytest.fixture
def integration_worksheet_repo(output_dir):
    """Worksheet repository backed by a real SQLite database."""
    os.makedirs(output_dir, exist_ok=True)
    db_path = os.path.join(output_dir, "worksheets.db")
    return WorksheetRepository(db_path)
