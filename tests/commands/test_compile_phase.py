import os
import json
from tests.factories.model_factories import (
    DashboardFactory,
    ProjectFactory,
    CsvScriptModelFactory,
    LocalMergeModelFactory,
    InsightFactory,
)
from tests.support.utils import temp_folder, temp_yml_file
from visivo.commands.compile_phase import compile_phase
from visivo.commands.utils import create_file_database
from visivo.models.defaults import Defaults
from visivo.parsers.file_names import PROJECT_FILE_NAME


def test_compile_csv_script_model():
    output_dir = temp_folder()
    model = CsvScriptModelFactory(name="csv_script_model")
    insight = InsightFactory(name="csv_insight", model=model)
    project = ProjectFactory(
        sources=[],
        models=[model],
        insights=[insight],
    )
    create_file_database(url=model.get_duckdb_source(output_dir).url(), output_dir=output_dir)

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    compile_phase(
        default_source=None,
        working_dir=working_dir,
        output_dir=output_dir,
    )
    assert "project.json" in os.listdir(f"{output_dir}")


def test_compile_csv_script_model_with_nested_local_merge_model():
    output_dir = temp_folder()

    csv_model = CsvScriptModelFactory(name="csv_model", args=["echo", "x,y\n1,2\n3,4\n5,6"])

    inner_merge_model = LocalMergeModelFactory(
        name="inner_merge_model",
        sql="SELECT x, y FROM csv_model.model",
        models=[csv_model],
    )

    outer_merge_model = LocalMergeModelFactory(
        name="outer_merge_model",
        sql="SELECT x, y FROM inner_merge_model.model",
        models=[inner_merge_model],
    )

    insight = InsightFactory(name="merge_insight", model=outer_merge_model)
    project = ProjectFactory(
        sources=[],
        models=[outer_merge_model],
        insights=[insight],
    )

    project.invalidate_dag_cache()
    dag = project.dag()

    create_file_database(
        url=outer_merge_model.get_duckdb_source(output_dir, dag=dag).url(),
        output_dir=output_dir,
    )

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    compile_phase(
        default_source=None,
        working_dir=working_dir,
        output_dir=output_dir,
    )
    assert "project.json" in os.listdir(f"{output_dir}")


def test_explorer_json_creation():
    """Test that explorer.json is created with flattened project structure"""
    output_dir = temp_folder()
    project = ProjectFactory(defaults=Defaults(source_name="source"))

    dashboard = DashboardFactory(
        name="Test Dashboard",
        level="L2",
        tags=["test", "example"],
        description="A test dashboard with new fields",
    )

    for i, row in enumerate(dashboard.rows):
        row.name = f"test_row_{i}"
        for j, item in enumerate(row.items):
            item.name = f"test_item_{i}_{j}"
            if item.chart:
                item.chart.name = f"test_chart_{i}_{j}"
                for k, insight in enumerate(item.chart.insights):
                    insight.name = f"test_insight_{i}_{j}_{k}"

    for i, row in enumerate(project.dashboards[0].rows):
        row.name = f"original_row_{i}"
        for j, item in enumerate(row.items):
            item.name = f"original_item_{i}_{j}"
            if item.chart:
                item.chart.name = f"original_chart_{i}_{j}"
                for k, insight in enumerate(item.chart.insights):
                    insight.name = f"original_insight_{i}_{j}_{k}"

    project.dashboards.append(dashboard)

    create_file_database(url=project.sources[0].url(), output_dir=output_dir)

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    compile_phase(
        default_source="source",
        working_dir=working_dir,
        output_dir=output_dir,
    )

    assert os.path.exists(f"{output_dir}/explorer.json")

    with open(f"{output_dir}/explorer.json") as f:
        explorer_data = json.load(f)

    assert "sources" in explorer_data
    assert "models" in explorer_data
    assert "insights" in explorer_data
    assert "default_source" in explorer_data
    assert explorer_data["default_source"] == "source"


def test_dashboard_new_fields():
    """Test the new dashboard fields (level, tags, description)"""
    project = ProjectFactory()

    dashboard = DashboardFactory(
        name="Test Dashboard",
        level="L0",
        tags=["critical", "production"],
        description="A critical dashboard for production metrics",
    )
    project.dashboards.append(dashboard)

    assert dashboard.level == "L0"
    assert "critical" in dashboard.tags
    assert "production" in dashboard.tags
    assert dashboard.description == "A critical dashboard for production metrics"
