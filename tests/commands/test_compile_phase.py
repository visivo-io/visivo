import os
import json
from tests.factories.model_factories import (
    DashboardFactory,
    ProjectFactory,
    CsvScriptModelFactory,
    LocalMergeModelFactory
)
from tests.support.utils import temp_file, temp_folder, temp_yml_file
from visivo.commands.compile_phase import compile_phase
from visivo.commands.utils import create_file_database
from visivo.models.defaults import Defaults
from visivo.parsers.file_names import PROJECT_FILE_NAME


def test_filtered_dashboard():
    output_dir = temp_folder()
    project = ProjectFactory(defaults=Defaults(source_name="source"))
    additional_dashboard = DashboardFactory(name="Other Dashboard")
    additional_dashboard.rows[0].name = "Additional Row"
    additional_dashboard.rows[0].items[0].name = "Additional Item"
    additional_dashboard.rows[0].items[0].chart.name = "Additional Chart"
    additional_dashboard.rows[0].items[
        0
    ].chart.selector.name = "Additional Chart Selector"
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

    compile_phase(
        default_source="source",
        working_dir=working_dir,
        output_dir=output_dir,
        dag_filter="+dashboard+",
    )
    assert "Additional Trace" not in os.listdir(output_dir)
    assert "trace" in os.listdir(output_dir)


def test_compile_csv_script_model():
    output_dir = temp_folder()
    project = ProjectFactory()
    project.sources = []
    model = CsvScriptModelFactory(name="csv_script_model")
    project.dashboards[0].rows[0].items[0].chart.traces[0].model = model
    create_file_database(
        url=model.get_duckdb_source(output_dir).url(), output_dir=output_dir
    )

    tmp = temp_yml_file(
        dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME
    )
    working_dir = os.path.dirname(tmp)

    compile_phase(
        default_source="source",
        working_dir=working_dir,
        output_dir=output_dir,
        dag_filter="+dashboard+",
    )
    assert "trace" in os.listdir(output_dir)
    with open(f"{output_dir}/trace/query.sql") as f:
        assert model.name in f.read()

def test_compile_csv_script_model_with_nested_local_merge_model():
    output_dir = temp_folder()
    project = ProjectFactory()
    project.sources = []
    
    # Create a base CSV model
    csv_model = CsvScriptModelFactory(
        name="csv_model",
        args=["echo", "x,y\n1,2\n3,4\n5,6"]
    )
    
    # Create inner local merge model that uses the CSV model
    inner_merge_model = LocalMergeModelFactory(
        name="inner_merge_model",
        sql="SELECT x, y FROM csv_model.model",
        models=[csv_model]
    )
    
    # Create outer local merge model that uses the inner merge model
    outer_merge_model = LocalMergeModelFactory(
        name="outer_merge_model",
        sql="SELECT x, y FROM inner_merge_model.model",
        models=[inner_merge_model]
    )

    project.dashboards[0].rows[0].items[0].chart.traces[0].model = outer_merge_model

    # Get the DAG first to ensure it's properly initialized
    dag = project.dag()
    
    create_file_database(
        url=outer_merge_model.get_duckdb_source(output_dir, dag=dag).url(),
        output_dir=output_dir
    )

    tmp = temp_yml_file(
        dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME
    )
    working_dir = os.path.dirname(tmp)

    compile_phase(
        default_source="source",
        working_dir=working_dir,
        output_dir=output_dir,
        dag_filter="+dashboard+",
    )
    assert "trace" in os.listdir(output_dir)
    with open(f"{output_dir}/trace/query.sql") as f:
        assert outer_merge_model.name in f.read()
