import os
import json
from tests.factories.model_factories import (
    DashboardFactory,
    ProjectFactory,
    CsvScriptModelFactory,
    LocalMergeModelFactory,
)
from tests.support.utils import temp_folder, temp_yml_file
from visivo.commands.compile_phase import compile_phase
from visivo.commands.utils import create_file_database
from visivo.models.defaults import Defaults
from visivo.parsers.file_names import PROJECT_FILE_NAME


def test_compile_csv_script_model():
    output_dir = temp_folder()
    project = ProjectFactory()
    project.sources = []
    model = CsvScriptModelFactory(name="csv_script_model")
    project.dashboards[0].rows[0].items[0].chart.traces[0].model = model
    create_file_database(url=model.get_duckdb_source(output_dir).url(), output_dir=output_dir)

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    compile_phase(
        default_source="source",
        working_dir=working_dir,
        output_dir=output_dir,
    )
    assert "project.json" in os.listdir(f"{output_dir}")


def test_compile_csv_script_model_with_nested_local_merge_model():
    output_dir = temp_folder()
    project = ProjectFactory()
    project.sources = []

    # Create a base CSV model
    csv_model = CsvScriptModelFactory(name="csv_model", args=["echo", "x,y\n1,2\n3,4\n5,6"])

    # Create inner local merge model that uses the CSV model
    inner_merge_model = LocalMergeModelFactory(
        name="inner_merge_model",
        sql="SELECT x, y FROM csv_model.model",
        models=[csv_model],
    )

    # Create outer local merge model that uses the inner merge model
    outer_merge_model = LocalMergeModelFactory(
        name="outer_merge_model",
        sql="SELECT x, y FROM inner_merge_model.model",
        models=[inner_merge_model],
    )

    project.dashboards[0].rows[0].items[0].chart.traces[0].model = outer_merge_model

    # Get the DAG first to ensure it's properly initialized
    dag = project.dag()

    create_file_database(
        url=outer_merge_model.get_duckdb_source(output_dir, dag=dag).url(),
        output_dir=output_dir,
    )

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    compile_phase(
        default_source="source",
        working_dir=working_dir,
        output_dir=output_dir,
    )
    assert "project.json" in os.listdir(f"{output_dir}")


def test_explorer_json_creation():
    """Test that explorer.json is created with flattened project structure"""
    output_dir = temp_folder()
    project = ProjectFactory(defaults=Defaults(source_name="source"))

    # Add a dashboard with new fields and ensure unique row names
    dashboard = DashboardFactory(
        name="Test Dashboard",
        level="L2",
        tags=["test", "example"],
        description="A test dashboard with new fields",
    )

    # Ensure unique row, item, chart, trace, model, and selector names in the new dashboard
    for i, row in enumerate(dashboard.rows):
        row.name = f"test_row_{i}"
        for j, item in enumerate(row.items):
            item.name = f"test_item_{i}_{j}"
            if item.chart:
                item.chart.name = f"test_chart_{i}_{j}"
                if item.chart.selector:
                    item.chart.selector.name = f"test_selector_{i}_{j}"
                for k, trace in enumerate(item.chart.traces):
                    trace.name = f"test_trace_{i}_{j}_{k}"
                    if trace.model:
                        trace.model.name = f"test_model_{i}_{j}_{k}"

    # Also ensure unique row, item, chart, trace, model, and selector names in the original dashboard
    for i, row in enumerate(project.dashboards[0].rows):
        row.name = f"original_row_{i}"
        for j, item in enumerate(row.items):
            item.name = f"original_item_{i}_{j}"
            if item.chart:
                item.chart.name = f"original_chart_{i}_{j}"
                if item.chart.selector:
                    item.chart.selector.name = f"original_selector_{i}_{j}"
                for k, trace in enumerate(item.chart.traces):
                    trace.name = f"original_trace_{i}_{j}_{k}"
                    if trace.model:
                        trace.model.name = f"original_model_{i}_{j}_{k}"

    project.dashboards.append(dashboard)

    create_file_database(url=project.sources[0].url(), output_dir=output_dir)

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    compile_phase(
        default_source="source",
        working_dir=working_dir,
        output_dir=output_dir,
    )

    # Verify explorer.json was created
    assert os.path.exists(f"{output_dir}/explorer.json")

    # Read and verify contents
    with open(f"{output_dir}/explorer.json") as f:
        explorer_data = json.load(f)

    assert "sources" in explorer_data
    assert "models" in explorer_data
    assert "traces" in explorer_data
    assert "default_source" in explorer_data
    assert explorer_data["default_source"] == "source"


def test_dashboard_new_fields():
    """Test the new dashboard fields (level, tags, description)"""
    project = ProjectFactory()

    # Create a dashboard with all new fields
    dashboard = DashboardFactory(
        name="Test Dashboard",
        level="L0",
        tags=["critical", "production"],
        description="A critical dashboard for production metrics",
    )
    project.dashboards.append(dashboard)

    # Verify the new fields were set correctly
    assert dashboard.level == "L0"
    assert "critical" in dashboard.tags
    assert "production" in dashboard.tags
    assert dashboard.description == "A critical dashboard for production metrics"
