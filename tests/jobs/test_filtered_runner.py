import io
import os
import sys
from tests.factories.model_factories import (
    CsvScriptModelFactory,
    DashboardFactory,
    DefaultsFactory,
    LocalMergeModelFactory,
    SqlModelFactory,
    ProjectFactory,
    SourceFactory,
    InsightFactory,
    ChartFactory,
    ItemFactory,
    RowFactory,
)
from visivo.jobs.filtered_runner import FilteredRunner
from tests.support.utils import temp_folder
from visivo.commands.utils import create_file_database
from visivo.server.hot_reload_server import HotReloadServer


def get_test_port():
    """Get an available port for testing"""
    return HotReloadServer.find_available_port()


def test_Runner_insight_with_default():
    output_dir = temp_folder()
    source = SourceFactory(name="source", database=f"{output_dir}/test.sqlite")
    model = SqlModelFactory(name="model1", source=None)
    insight = InsightFactory(name="insight1", model=model)
    defaults = DefaultsFactory(source_name=source.name)
    project = ProjectFactory(
        defaults=defaults,
        sources=[source],
        models=[model],
        insights=[insight],
        dashboards=[],
    )

    create_file_database(url=source.url(), output_dir=output_dir)

    port = get_test_port()
    server_url = f"http://localhost:{port}"
    runner = FilteredRunner(project=project, output_dir=output_dir, server_url=server_url)
    runner.run()
    assert os.path.exists(f"{output_dir}/main/insights/{insight.name}.json")


def test_Runner_insight_given_source():
    port = get_test_port()
    server_url = f"http://localhost:{port}"
    output_dir = temp_folder()
    source = SourceFactory(name="my_source", database=f"{output_dir}/test.sqlite")
    model = SqlModelFactory(name="model1", source="ref(my_source)")
    insight = InsightFactory(name="insight1", model=model)
    project = ProjectFactory(
        sources=[source],
        models=[model],
        insights=[insight],
        dashboards=[],
    )

    create_file_database(url=source.url(), output_dir=output_dir)

    runner = FilteredRunner(project=project, output_dir=output_dir, server_url=server_url)
    runner.run()
    assert os.path.exists(f"{output_dir}/main/insights/{insight.name}.json")


def test_runner_with_csv_script_model():
    port = get_test_port()
    server_url = f"http://localhost:{port}"
    output_dir = temp_folder()
    os.makedirs(f"{output_dir}", exist_ok=True)
    model = CsvScriptModelFactory(
        name="csv_script_model", args=["echo", "x,y\n1,1\n2,1\n3,2\n4,3\n5,5\n6,8"]
    )
    project = ProjectFactory(
        sources=[],
        models=[model],
        dashboards=[],
    )

    runner = FilteredRunner(project=project, output_dir=output_dir, server_url=server_url)
    runner.run()
    assert os.path.exists(f"{output_dir}/main/models/{model.name}.duckdb")


def test_runner_with_local_merge_model():
    output_dir = temp_folder()
    port = get_test_port()
    server_url = f"http://localhost:{port}"
    source1 = SourceFactory(name="source1", database=f"{output_dir}/test1.db")
    source2 = SourceFactory(name="source2", database=f"{output_dir}/test2.db")
    sub_model1 = SqlModelFactory(name="model1", source="ref(source1)")
    sub_model2 = SqlModelFactory(name="model2", source="ref(source2)")
    create_file_database(url=source1.url(), output_dir=output_dir)
    create_file_database(url=source2.url(), output_dir=output_dir)

    model = LocalMergeModelFactory(
        name="local_merge_model",
        sql="select t1.x as x, t2.y as y, 'values' as 'cohort_on' from model1.model t1 JOIN model2.model t2 on t1.x=t2.x",
        models=[sub_model1, sub_model2],
    )
    project = ProjectFactory(
        sources=[source1, source2],
        models=[model],
        dashboards=[],
    )

    runner = FilteredRunner(project=project, output_dir=output_dir, server_url=server_url)
    runner.run()
    assert os.path.exists(f"{output_dir}/main/models/{model.name}.duckdb")


def test_runner_dag_filter():
    output_dir = temp_folder()
    source = SourceFactory(name="test_source", database=f"{output_dir}/test.sqlite")
    model = SqlModelFactory(name="model1", source="ref(test_source)")
    insight = InsightFactory(name="insight1", model=model)

    chart1 = ChartFactory(name="Main Chart", insights=[insight])
    item1 = ItemFactory(chart=chart1, name="item1")
    row1 = RowFactory(items=[item1], name="row1")
    main_dashboard = DashboardFactory(name="dashboard", rows=[row1])

    other_insight = InsightFactory(name="other_insight")
    chart2 = ChartFactory(name="Other Chart", insights=[other_insight])
    item2 = ItemFactory(chart=chart2, name="item2")
    row2 = RowFactory(items=[item2], name="row2")
    other_dashboard = DashboardFactory(name="Other Dashboard", rows=[row2])

    project = ProjectFactory(
        sources=[source],
        models=[model],
        dashboards=[main_dashboard, other_dashboard],
    )

    create_file_database(url=source.url(), output_dir=output_dir)

    port = get_test_port()
    server_url = f"http://localhost:{port}"

    runner = FilteredRunner(
        project=project,
        output_dir=output_dir,
        dag_filter="+dashboard+",
        server_url=server_url,
    )
    runner.run()
    assert os.path.exists(f"{output_dir}/main/insights/{insight.name}.json")


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

    project = ProjectFactory(
        sources=[],
        models=[local_merge_model],
        dashboards=[],
    )

    runner = FilteredRunner(project=project, output_dir=output_dir)
    runner.run()

    assert os.path.exists(f"{output_dir}/main/models/{csv_model.name}.duckdb")
    assert os.path.exists(f"{output_dir}/main/models/{local_merge_model.name}.duckdb")


def test_runner_with_nested_local_merge_models():
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

    project = ProjectFactory(
        sources=[],
        models=[outer_merge_model],
        dashboards=[],
    )

    runner = FilteredRunner(project=project, output_dir=output_dir)
    runner.run()

    assert os.path.exists(f"{output_dir}/main/models/{csv_model.name}.duckdb")
    assert os.path.exists(f"{output_dir}/main/models/{inner_merge_model.name}.duckdb")
    assert os.path.exists(f"{output_dir}/main/models/{outer_merge_model.name}.duckdb")
