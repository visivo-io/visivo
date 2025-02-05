import os
import pytest
from visivo.query.jobs.run_thumbnail_job import ThumbnailJob
from visivo.models.project import Project
from visivo.models.dashboard import Dashboard

@pytest.fixture
def test_project():
    # Use the integration test project
    project_dir = os.path.join(os.path.dirname(__file__), '../../test-projects/integration')
    return Project.from_directory(project_dir)

@pytest.fixture
def output_dir(tmp_path):
    return str(tmp_path / "target")

@pytest.fixture
def dashboard(test_project):
    return test_project.dashboards[0]

def test_thumbnail_job_generates_thumbnail(test_project, dashboard, output_dir):
    job = ThumbnailJob(
        project=test_project,
        dashboard=dashboard,
        output_dir=output_dir
    )
    
    result = job.run()
    assert result.success
    
    # Check that thumbnail was created
    thumbnail_path = os.path.join(output_dir, "dashboard-thumbnails", f"{dashboard.name.replace('/', '_')}.png")
    assert os.path.exists(thumbnail_path)
    assert os.path.getsize(thumbnail_path) > 0

def test_thumbnail_job_handles_browser_errors(test_project, dashboard, output_dir):
    # Create a dashboard that will cause browser errors
    dashboard.layout = None
    
    job = ThumbnailJob(
        project=test_project,
        dashboard=dashboard,
        output_dir=output_dir
    )
    
    result = job.run()
    assert not result.success
    assert "Failed to generate thumbnail" in result.error

def test_thumbnail_job_respects_timeout(test_project, dashboard, output_dir):
    job = ThumbnailJob(
        project=test_project,
        dashboard=dashboard,
        output_dir=output_dir,
        timeout_ms=1  # Set unreasonably low timeout
    )
    
    result = job.run()
    assert not result.success
    assert "Timeout" in result.error

def test_thumbnail_job_sanitizes_filenames(test_project, output_dir):
    # Create dashboard with special characters in name
    dashboard = Dashboard(name="Test/Special?Chars*Dashboard")
    
    job = ThumbnailJob(
        project=test_project,
        dashboard=dashboard,
        output_dir=output_dir
    )
    
    result = job.run()
    assert result.success
    
    # Check that thumbnail was created with sanitized name
    thumbnail_path = os.path.join(output_dir, "dashboard-thumbnails", "Test_Special_Chars_Dashboard.png")
    assert os.path.exists(thumbnail_path) 