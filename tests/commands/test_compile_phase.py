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
    # project.json is now generated lazily at `visivo dist` time, not by compile.
    assert "error.json" in os.listdir(f"{output_dir}")
    assert "project.json" not in os.listdir(f"{output_dir}")


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
    # project.json is now generated lazily at `visivo dist` time, not by compile.
    assert "error.json" in os.listdir(f"{output_dir}")
    assert "project.json" not in os.listdir(f"{output_dir}")


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
