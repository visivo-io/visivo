import os
from unittest.mock import patch
from tests.factories.model_factories import DashboardFactory, ProjectFactory
from tests.support.utils import temp_file, temp_folder
from visivo.commands.serve_phase import get_project_json
from visivo.commands.utils import create_file_database


def test_get_project_json():
    output_dir = temp_folder()
    project = ProjectFactory()
    additional_dashboard = DashboardFactory(name="Other Dashboard")
    additional_dashboard.rows[0].items[0].chart.name = "Additional Chart"
    additional_dashboard.rows[0].items[0].chart.traces[0].name = "Additional Trace"
    additional_dashboard.rows[0].items[0].chart.traces[
        0
    ].model.name = "Additional Model"
    project.dashboards.append(additional_dashboard)
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)

    tmp = temp_file(contents=project.model_dump_json(), name="project.json")
    working_dir = os.path.dirname(tmp)

    project_json = get_project_json(output_dir=working_dir, name_filter="dashboard")
    assert len(project_json["dashboards"]) == 1
