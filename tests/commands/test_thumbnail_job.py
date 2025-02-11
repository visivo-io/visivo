import hashlib
import os
import pytest
from visivo.query.jobs.run_thumbnail_job import job, action
from tests.factories.model_factories import ProjectFactory, DashboardFactory
from tests.support.utils import temp_folder
from visivo.utils import sanitize_filename


@pytest.fixture
def test_project():
    project = ProjectFactory()
    return project


@pytest.fixture
def output_dir():
    return temp_folder()


@pytest.fixture
def dashboard():
    return DashboardFactory()


@pytest.fixture
def server_url():
    return "http://localhost:8000"


def test_thumbnail_job_requires_server_url(test_project, dashboard, output_dir):
    job_instance = job(
        project=test_project,
        dashboard=dashboard,
        output_dir=output_dir,
        thumbnail_mode="all",
    )

    result = job_instance.action(**job_instance.kwargs)
    assert not result.success
    assert "no server URL is provided" in result.message


def test_thumbnail_job_skips_if_exists(test_project, dashboard, output_dir, server_url):
    # Create a dummy thumbnail file
    os.makedirs(os.path.join(output_dir, "dashboards"), exist_ok=True)
    sanitized_name = sanitize_filename(dashboard.name)
    thumbnail_path = os.path.join(output_dir, "dashboards", f"{sanitized_name}.png")
    with open(thumbnail_path, "wb") as f:
        f.write(b"dummy data")

    # Run job with 'missing' mode
    job_instance = job(
        project=test_project,
        dashboard=dashboard,
        output_dir=output_dir,
        thumbnail_mode="missing",
        server_url=server_url,
    )

    result = job_instance.action(**job_instance.kwargs)
    assert result.success
    assert "already exists" in result.message


def test_thumbnail_job_handles_browser_errors(
    test_project, dashboard, output_dir, server_url
):
    # Create a dashboard that will cause browser errors by having empty rows
    # This will cause a timeout waiting for .dashboard-row selector
    dashboard.rows = []

    job_instance = job(
        project=test_project,
        dashboard=dashboard,
        output_dir=output_dir,
        thumbnail_mode="all",
        server_url=server_url,
        timeout_ms=1,  # Set a very short timeout to ensure we get a timeout error
    )

    result = job_instance.action(**job_instance.kwargs)
    assert not result.success
    assert "Failed to generate thumbnail" in result.message


def test_thumbnail_job_sanitizes_filenames(test_project, output_dir, server_url):
    # Create dashboard with special characters in name
    dashboard = DashboardFactory(name="Test/Special?Chars*Dashboard")

    job_instance = job(
        project=test_project,
        dashboard=dashboard,
        output_dir=output_dir,
        thumbnail_mode="all",
        server_url=server_url,
    )

    # Mock the actual thumbnail generation to avoid browser dependency
    def mock_generate(*args, **kwargs):
        thumbnail_path = os.path.join(
            output_dir, "dashboard-thumbnails", "Test_Special_Chars_Dashboard.png"
        )
        os.makedirs(os.path.dirname(thumbnail_path), exist_ok=True)
        with open(thumbnail_path, "wb") as f:
            f.write(b"mock thumbnail")
        return thumbnail_path

    # Temporarily replace the generate_thumbnail function
    import visivo.query.jobs.run_thumbnail_job as thumbnail_module

    original_generate = thumbnail_module.generate_thumbnail
    thumbnail_module.generate_thumbnail = mock_generate

    try:
        result = job_instance.action(**job_instance.kwargs)
        assert result.success
        assert os.path.exists(
            os.path.join(
                output_dir, "dashboard-thumbnails", "Test_Special_Chars_Dashboard.png"
            )
        )
    finally:
        # Restore the original function
        thumbnail_module.generate_thumbnail = original_generate
