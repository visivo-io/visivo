from tests.factories.model_factories import (
    CsvScriptModelFactory,
    DashboardFactory,
    DefaultsFactory,
    LocalMergeModelFactory,
    SqlModelFactory,
    ProjectFactory,
    TargetFactory,
)
from visivo.models.targets.sqlite_target import SqliteTarget
from visivo.query.runner import Runner
from tests.factories.model_factories import TraceFactory
from tests.support.utils import temp_folder
from visivo.commands.utils import create_file_database
import os


def test_Runner_trace_with_default():
    output_dir = temp_folder()
    target = TargetFactory(name="target", database=f"{output_dir}/test.sqlite")
    model = SqlModelFactory(name="model1", target=None)
    trace = TraceFactory(name="trace1", model=model)
    defaults = DefaultsFactory(target_name=target.name)
    project = ProjectFactory(
        defaults=defaults, targets=[target], traces=[trace], dashboards=[]
    )

    create_file_database(url=target.url(), output_dir=output_dir)

    os.makedirs(f"{output_dir}/{trace.name}", exist_ok=True)
    with open(f"{output_dir}/{trace.name}/query.sql", "w") as fp:
        fp.write("select *, 'values' as 'cohort_on' from test_table")

    runner = Runner(project=project, output_dir=output_dir)
    runner.run()
    assert os.path.exists(f"{output_dir}/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/{trace.name}/data.json")


def test_Runner_trace_given_target():
    output_dir = temp_folder()
    target = TargetFactory(database=f"{output_dir}/test.sqlite")
    model = SqlModelFactory(name="model1", target=target)
    trace = TraceFactory(name="trace1", model=model)
    project = ProjectFactory(targets=[], traces=[trace], dashboards=[])

    create_file_database(url=target.url(), output_dir=output_dir)

    os.makedirs(f"{output_dir}/{trace.name}", exist_ok=True)
    with open(f"{output_dir}/{trace.name}/query.sql", "w") as fp:
        fp.write("select *, 'values' as 'cohort_on' from test_table")

    runner = Runner(project=project, output_dir=output_dir)
    runner.run()
    assert os.path.exists(f"{output_dir}/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/{trace.name}/data.json")


def test_runner_with_csv_script_model():
    output_dir = temp_folder()
    model = CsvScriptModelFactory(name="csv_script_model")
    trace = TraceFactory(name="trace1", model=model)
    project = ProjectFactory(targets=[], traces=[trace], dashboards=[])

    os.makedirs(f"{output_dir}/{trace.name}", exist_ok=True)
    with open(f"{output_dir}/{trace.name}/query.sql", "w") as fp:
        fp.write(f"select *, 'value' as 'cohort_on' from {model.table_name}")

    runner = Runner(project=project, output_dir=output_dir)
    runner.run()
    assert os.path.exists(f"{output_dir}/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/{trace.name}/data.json")
    assert os.path.exists(f"{output_dir}/{model.name}.sqlite")


def test_runner_with_local_merge_model():
    output_dir = temp_folder()

    target1 = TargetFactory(name="target1", database=f"{output_dir}/test1.db")
    target2 = TargetFactory(name="target2", database=f"{output_dir}/test2.db")
    sub_model1 = SqlModelFactory(name="model1", target=target1)
    sub_model2 = SqlModelFactory(name="model2", target=target2)
    create_file_database(url=target1.url(), output_dir=output_dir)
    create_file_database(url=target2.url(), output_dir=output_dir)

    model = LocalMergeModelFactory(
        name="local_merge_model", models=[sub_model1, sub_model2]
    )
    trace = TraceFactory(name="trace1", model=model)
    project = ProjectFactory(targets=[], traces=[trace], dashboards=[], models=[])

    os.makedirs(f"{output_dir}/{trace.name}", exist_ok=True)
    with open(f"{output_dir}/{trace.name}/query.sql", "w") as fp:
        fp.write(
            "select t1.x as x, t2.y as y, 'values' as 'cohort_on' from model1.model t1 JOIN model2.model t2 on t1.x=t2.x"
        )

    runner = Runner(project=project, output_dir=output_dir)
    runner.run()
    assert os.path.exists(f"{output_dir}/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/{trace.name}/data.json")


def test_runner_name_filter():
    output_dir = temp_folder()
    project = ProjectFactory()
    target = TargetFactory(database=f"{output_dir}/test.sqlite")
    model = SqlModelFactory(name="model1", target=target)
    trace = TraceFactory(name="trace1", model=model)
    project.dashboards[0].rows[0].items[0].chart.traces[0] = trace

    additional_dashboard = DashboardFactory(name="Other Dashboard")
    additional_dashboard.rows[0].items[0].chart.name = "Additional Chart"
    additional_dashboard.rows[0].items[0].chart.traces[0].name = "Additional Trace"
    additional_dashboard.rows[0].items[0].chart.traces[0].model.name = "Other Model"
    additional_dashboard.rows[0].items[0].chart.traces[
        0
    ].model.sql = "select * from no_exist"
    additional_dashboard.rows[0].items[0].chart.traces[0].model.target = target
    project.dashboards.append(additional_dashboard)

    create_file_database(url=target.url(), output_dir=output_dir)

    os.makedirs(f"{output_dir}/{trace.name}", exist_ok=True)
    with open(f"{output_dir}/{trace.name}/query.sql", "w") as fp:
        fp.write("select *, 'values' as 'cohort_on' from test_table")

    os.makedirs(f"{output_dir}/Additional Trace", exist_ok=True)
    with open(f"{output_dir}/Additional Trace/query.sql", "w") as fp:
        fp.write("select *, 'values' as 'cohort_on' from no_exist")

    runner = Runner(project=project, output_dir=output_dir, name_filter="dashboard")
    runner.run()
    assert os.path.exists(f"{output_dir}/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/{trace.name}/data.json")
