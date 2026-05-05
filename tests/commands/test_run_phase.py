import os
import json
from tests.factories.model_factories import (
    DashboardFactory,
    ProjectFactory,
    SqlModelFactory,
    InsightFactory,
    ChartFactory,
    ItemFactory,
    RowFactory,
)
from tests.support.utils import temp_folder, temp_yml_file
from visivo.commands.run_phase import run_phase
from visivo.commands.utils import create_file_database
from visivo.models.defaults import Defaults
from visivo.parsers.file_names import PROJECT_FILE_NAME


def _make_project_with_insight():
    """Create a project with an insight that references a model."""
    model = SqlModelFactory(name="model", source="ref(source)")
    insight = InsightFactory(name="insight", model=model)
    chart = ChartFactory(
        name="chart",
        insights=[insight],
    )
    item = ItemFactory(name="item", chart=chart)
    row = RowFactory(name="row", items=[item])
    dashboard = DashboardFactory(name="dashboard", rows=[row])
    project = ProjectFactory(
        defaults=Defaults(source_name="source"),
        models=[model],
        dashboards=[dashboard],
    )
    return project, insight


def test_run_phase():
    output_dir = temp_folder()
    project, insight = _make_project_with_insight()

    additional_model = SqlModelFactory(name="additional_model", source="ref(source)")
    additional_insight = InsightFactory(name="additional_insight", model=additional_model)
    additional_chart = ChartFactory(
        name="additional_chart",
        insights=[additional_insight],
    )
    additional_item = ItemFactory(name="additional_item", chart=additional_chart)
    additional_row = RowFactory(name="additional_row", items=[additional_item])
    additional_dashboard = DashboardFactory(name="other_dashboard", rows=[additional_row])

    project.models.append(additional_model)
    project.dashboards.append(additional_dashboard)
    project.invalidate_dag_cache()

    create_file_database(url=project.sources[0].url(), output_dir=output_dir)

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    run_phase(
        default_source="source",
        working_dir=working_dir,
        output_dir=output_dir,
        dag_filter="+dashboard+",
    )
    assert os.path.exists(f"{output_dir}/main/insights/{insight.name}.json")
