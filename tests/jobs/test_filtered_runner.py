import io
import os
import sys
from networkx import is_directed_acyclic_graph
from tests.factories.model_factories import (
    CsvScriptModelFactory,
    DashboardFactory,
    DefaultsFactory,
    LocalMergeModelFactory,
    SqlModelFactory,
    ProjectFactory,
    SourceFactory,
)
from visivo.jobs.filtered_runner import FilteredRunner
from tests.factories.model_factories import TraceFactory
from tests.support.utils import temp_folder
from visivo.commands.utils import create_file_database
from visivo.server.hot_reload_server import HotReloadServer


def get_test_port():
    """Get an available port for testing"""
    return HotReloadServer.find_available_port()


def test_Runner_trace_with_default():
    output_dir = temp_folder()
    source = SourceFactory(name="source", database=f"{output_dir}/test.sqlite")
    model = SqlModelFactory(name="model1", source=None)
    trace = TraceFactory(name="trace1", model=model)
    defaults = DefaultsFactory(source_name=source.name)
    project = ProjectFactory(defaults=defaults, sources=[source], traces=[trace], dashboards=[])

    create_file_database(url=source.url(), output_dir=output_dir)

    os.makedirs(f"{output_dir}/traces/{trace.name}", exist_ok=True)
    with open(f"{output_dir}/traces/{trace.name}/query.sql", "w") as fp:
        fp.write("select *, 'values' as 'cohort_on' from test_table")

    port = get_test_port()
    server_url = f"http://localhost:{port}"
    runner = FilteredRunner(project=project, output_dir=output_dir, server_url=server_url)
    runner.run()
    assert os.path.exists(f"{output_dir}/traces/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/traces/{trace.name}/data.json")


def test_Runner_trace_given_source():
    port = get_test_port()
    server_url = f"http://localhost:{port}"
    output_dir = temp_folder()
    source = SourceFactory(database=f"{output_dir}/test.sqlite")
    model = SqlModelFactory(name="model1", source=source)
    trace = TraceFactory(name="trace1", model=model)
    project = ProjectFactory(sources=[], traces=[trace], dashboards=[])

    create_file_database(url=source.url(), output_dir=output_dir)

    os.makedirs(f"{output_dir}/traces/{trace.name}", exist_ok=True)
    with open(f"{output_dir}/traces/{trace.name}/query.sql", "w") as fp:
        fp.write("select *, 'values' as 'cohort_on' from test_table")

    runner = FilteredRunner(project=project, output_dir=output_dir, server_url=server_url)
    runner.run()
    assert os.path.exists(f"{output_dir}/traces/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/traces/{trace.name}/data.json")


def test_runner_with_csv_script_model():
    port = get_test_port()
    server_url = f"http://localhost:{port}"
    output_dir = temp_folder()
    model = CsvScriptModelFactory(name="csv_script_model")
    trace = TraceFactory(name="trace1", model=model)
    project = ProjectFactory(sources=[], traces=[trace], dashboards=[])

    os.makedirs(f"{output_dir}/traces/{trace.name}", exist_ok=True)
    with open(f"{output_dir}/traces/{trace.name}/query.sql", "w") as fp:
        fp.write(f"select *, 'value' as 'cohort_on' from {model.table_name}")

    runner = FilteredRunner(project=project, output_dir=output_dir, server_url=server_url)
    runner.run()
    assert os.path.exists(f"{output_dir}/traces/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/traces/{trace.name}/data.json")
    assert os.path.exists(f"{output_dir}/{model.name}.duckdb")


def test_runner_with_local_merge_model():
    output_dir = temp_folder()
    port = get_test_port()
    server_url = f"http://localhost:{port}"
    source1 = SourceFactory(name="source1", database=f"{output_dir}/test1.db")
    source2 = SourceFactory(name="source2", database=f"{output_dir}/test2.db")
    sub_model1 = SqlModelFactory(name="model1", source=source1)
    sub_model2 = SqlModelFactory(name="model2", source=source2)
    create_file_database(url=source1.url(), output_dir=output_dir)
    create_file_database(url=source2.url(), output_dir=output_dir)

    model = LocalMergeModelFactory(
        name="local_merge_model",
        sql="select t1.x as x, t2.y as y, 'values' as 'cohort_on' from model1.model t1 JOIN model2.model t2 on t1.x=t2.x",
        models=[sub_model1, sub_model2],
    )
    trace = TraceFactory(name="trace1", model=model)
    project = ProjectFactory(sources=[], traces=[trace], dashboards=[], models=[])

    os.makedirs(f"{output_dir}/traces/{trace.name}", exist_ok=True)
    with open(f"{output_dir}/traces/{trace.name}/query.sql", "w") as fp:
        fp.write("SELECT * FROM local_merge_model.model")

    runner = FilteredRunner(project=project, output_dir=output_dir, server_url=server_url)
    runner.run()
    assert os.path.exists(f"{output_dir}/traces/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/traces/{trace.name}/data.json")


def test_runner_dag_filter():
    output_dir = temp_folder()
    project = ProjectFactory()
    source = SourceFactory(database=f"{output_dir}/test.sqlite")
    model = SqlModelFactory(name="model1", source=source)
    trace = TraceFactory(name="trace1", model=model)
    project.dashboards[0].rows[0].items[0].chart.traces[0] = trace

    additional_dashboard = DashboardFactory(name="Other Dashboard")
    additional_dashboard.rows[0].items[0].chart.name = "Additional Chart"
    additional_dashboard.rows[0].items[0].chart.traces[0].name = "Additional Trace"
    additional_dashboard.rows[0].items[0].chart.traces[0].model.name = "Other Model"
    additional_dashboard.rows[0].items[0].chart.traces[0].model.sql = "select * from no_exist"
    additional_dashboard.rows[0].items[0].chart.traces[0].model.source = source
    project.dashboards.append(additional_dashboard)

    create_file_database(url=source.url(), output_dir=output_dir)

    os.makedirs(f"{output_dir}/traces/{trace.name}", exist_ok=True)
    with open(f"{output_dir}/traces/{trace.name}/query.sql", "w") as fp:
        fp.write("select *, 'values' as 'cohort_on' from test_table")

    os.makedirs(f"{output_dir}/Additional Trace", exist_ok=True)
    with open(f"{output_dir}/Additional Trace/query.sql", "w") as fp:
        fp.write("select *, 'values' as 'cohort_on' from no_exist")

    port = get_test_port()
    server_url = f"http://localhost:{port}"

    runner = FilteredRunner(
        project=project,
        output_dir=output_dir,
        dag_filter="+dashboard+",
        thumbnail_mode="none",
        server_url=server_url,
    )
    runner.run()
    assert os.path.exists(f"{output_dir}/traces/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/traces/{trace.name}/data.json")


def test_runner_dag_filter_with_no_jobs():
    output_dir = temp_folder()
    project = ProjectFactory()

    capturedOutput = io.StringIO()
    sys.stdout = capturedOutput

    port = get_test_port()
    server_url = f"http://localhost:{port}"
    runner = FilteredRunner(
        project=project,
        output_dir=output_dir,
        dag_filter="dashboard+",
        thumbnail_mode="none",
        server_url=server_url,
    )
    runner.run()

    sys.stdout = sys.__stdout__
    assert (
        "No jobs run. Ensure your filter contains nodes that are runnable."
        in capturedOutput.getvalue()
    )


def test_runner_with_local_merge_and_csv_model():
    output_dir = temp_folder()

    csv_model = CsvScriptModelFactory(name="csv_model", args=["echo", "x,y\n1,2\n3,4\n5,6"])

    local_merge_model = LocalMergeModelFactory(
        name="local_merge_model",
        sql="SELECT * FROM csv_model.model",
        models=[csv_model],
    )

    trace = TraceFactory(name="trace1", model=local_merge_model)
    project = ProjectFactory(sources=[], traces=[trace], dashboards=[], models=[])

    os.makedirs(f"{output_dir}/traces/{trace.name}", exist_ok=True)
    with open(f"{output_dir}/traces/{trace.name}/query.sql", "w") as fp:
        fp.write("SELECT x, y, 'values' as cohort_on FROM csv_model.model")

    runner = FilteredRunner(project=project, output_dir=output_dir)
    runner.run()

    assert os.path.exists(f"{output_dir}/traces/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/traces/{trace.name}/data.json")
    assert os.path.exists(f"{output_dir}/csv_model.duckdb")
    assert os.path.exists(f"{output_dir}/local_merge_model.duckdb")


def test_runner_with_nested_local_merge_models():
    output_dir = temp_folder()

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

    trace = TraceFactory(name="trace1", model=outer_merge_model)
    project = ProjectFactory(sources=[], traces=[trace], dashboards=[], models=[])

    os.makedirs(f"{output_dir}/traces/{trace.name}", exist_ok=True)
    trace_query_sql = """
        WITH 
    base_query as (
        SELECT x, y FROM inner_merge_model.model
    ),
    columnize_cohort_on as (
        SELECT 
            *,
            'trace' as "cohort_on"
        FROM base_query
    )
    SELECT
                x as "props.x",
                y as "props.y",
        "cohort_on"
    FROM columnize_cohort_on
        GROUP BY
            y  , 
            x ,
        "cohort_on" 
    """
    with open(f"{output_dir}/traces/{trace.name}/query.sql", "w") as fp:
        fp.write(trace_query_sql)

    runner = FilteredRunner(project=project, output_dir=output_dir)
    runner.run()

    assert os.path.exists(f"{output_dir}/traces/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/traces/{trace.name}/data.json")
    assert os.path.exists(f"{output_dir}/csv_model.duckdb")
    assert os.path.exists(f"{output_dir}/inner_merge_model.duckdb")
    assert os.path.exists(f"{output_dir}/outer_merge_model.duckdb")
