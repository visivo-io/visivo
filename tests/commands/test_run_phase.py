import os
import json
from unittest.mock import patch
from tests.factories.model_factories import DashboardFactory, ProjectFactory
from tests.support.utils import temp_folder, temp_yml_file
from visivo.commands.run_phase import run_phase
from visivo.commands.utils import create_file_database
from visivo.parsers.core_parser import PROFILE_FILE_NAME, PROJECT_FILE_NAME
from visivo.query.runner import Runner
from unittest.mock import ANY


@patch.object(Runner, '__new__')
def test_filtered_dashboard(mock_method):
    output_dir = temp_folder()
    project = ProjectFactory()
    trace = project.dashboards[0].rows[0].items[0].chart.traces[0]
    additional_dashboard = DashboardFactory(name="Other Dashboard")
    additional_dashboard.rows[0].items[0].chart.name = "Additional Chart"
    additional_dashboard.rows[0].items[0].chart.traces[0].name = "Additional Trace"
    additional_dashboard.rows[0].items[0].chart.traces[0].model.name = "Additional Model"
    project.dashboards.append(additional_dashboard)
    create_file_database(url=project.targets[0].url(), output_dir=output_dir)

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    run_phase(
        default_target="target",
        working_dir=working_dir,
        output_dir=output_dir,
        name_filter="dashboard",
    )
    mock_method.assert_called_with(Runner, **{'traces': [trace], "project":ANY, "default_target":ANY, "output_dir":ANY})
 
