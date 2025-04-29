import os
import json
from tests.factories.model_factories import DashboardFactory, ProjectFactory
from tests.support.utils import temp_folder, temp_yml_file
from visivo.commands.run_phase import run_phase
from visivo.commands.utils import create_file_database
from visivo.models.defaults import Defaults
from visivo.parsers.file_names import PROJECT_FILE_NAME


def test_run_phase():
    output_dir = temp_folder()
    project = ProjectFactory(defaults=Defaults(source_name="source"))
    trace = project.dashboards[0].rows[0].items[0].chart.traces[0]
    additional_dashboard = DashboardFactory(name="Other Dashboard")
    additional_dashboard.rows[0].items[0].name = "Additional Item"
    additional_dashboard.rows[0].name = "Additional Row"
    additional_dashboard.rows[0].items[
        0
    ].chart.selector.name = "Additional Chart Selector"
    additional_dashboard.rows[0].items[0].chart.name = "Additional Chart"
    additional_dashboard.rows[0].items[0].chart.traces[0].name = "Additional Trace"
    additional_dashboard.rows[0].items[0].chart.traces[
        0
    ].model.name = "Additional Model"
    project.dashboards.append(additional_dashboard)
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)

    tmp = temp_yml_file(
        dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME
    )
    working_dir = os.path.dirname(tmp)

    run_phase(
        default_source="source",
        working_dir=working_dir,
        output_dir=output_dir,
        dag_filter="+dashboard+",
        thumbnail_mode="none",
    )
    assert os.path.exists(f"{output_dir}/traces/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/traces/{trace.name}/data.json")
