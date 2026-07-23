import io
import os
import sys
from tests.factories.model_factories import (
    DashboardFactory,
    DefaultsFactory,
    SqlModelFactory,
    ProjectFactory,
    SourceFactory,
    DuckdbSourceFactory,
    SeedFactory,
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


def test_runner_with_seeded_source():
    output_dir = temp_folder()
    source = DuckdbSourceFactory(
        name="seed_source",
        database=f"{output_dir}/seeded.duckdb",
        seeds=[SeedFactory(table_name="raw", args=["echo", "x,y\n1,1\n2,1\n3,2"])],
    )
    model = SqlModelFactory(name="seeded_model", source="ref(seed_source)", sql="select * from raw")
    project = ProjectFactory(sources=[source], models=[model], dashboards=[])

    runner = FilteredRunner(project=project, output_dir=output_dir)
    runner.run()

    assert source.read_sql("select count(*) as c from raw") == [{"c": 3}]


def test_runner_seeds_land_before_a_model_joins_them():
    """Two seeds on one source, joined by one model.

    This is the pattern that replaces LocalMergeModel: the Model->Source DAG edge
    is what guarantees both seeds are loaded before the join runs.
    """
    output_dir = temp_folder()
    source = DuckdbSourceFactory(
        name="seed_source",
        database=f"{output_dir}/seeded.duckdb",
        seeds=[
            SeedFactory(table_name="left_rows", args=["echo", "x,y\n1,2\n3,4\n5,6"]),
            SeedFactory(table_name="right_rows", args=["echo", "x,z\n1,7\n3,8\n5,9"]),
        ],
    )
    model = SqlModelFactory(
        name="joined",
        source="ref(seed_source)",
        sql="select l.x, l.y, r.z from left_rows l join right_rows r on l.x = r.x",
    )
    project = ProjectFactory(sources=[source], models=[model], dashboards=[])

    runner = FilteredRunner(project=project, output_dir=output_dir)
    runner.run()

    assert source.read_sql(model.sql) == [
        {"x": 1, "y": 2, "z": 7},
        {"x": 3, "y": 4, "z": 8},
        {"x": 5, "y": 6, "z": 9},
    ]
