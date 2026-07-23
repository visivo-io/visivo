import os
import pytest
from visivo.server.flask_app import FlaskApp
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

    # Explicit working_dir (isolated tmp dir, not the real cwd) so anything
    # that writes project-root workbench state — e.g. ExplorationRepository's
    # `.visivo/explorations/` — stays inside the test's temp folder instead of
    # leaking files into the actual repo working tree.
    app = FlaskApp(abs_output_dir, project, working_dir=abs_output_dir)
    app.app.config["TESTING"] = True
    return app


@pytest.fixture
def integration_client(integration_app):
    """Test client for the integration FlaskApp.

    Use this to make real HTTP requests against Flask endpoints
    with working managers and a real SQLite database.
    """
    return integration_app.app.test_client()
