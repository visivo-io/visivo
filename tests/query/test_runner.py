from tests.factories.model_factories import (
    CsvScriptModelFactory,
    DefaultsFactory,
    SqlModelFactory,
    ProjectFactory,
)
from visivo.query.runner import Runner
from visivo.query.jobs.job import format_message
from tests.factories.model_factories import TraceFactory
from visivo.models.target import Target, TypeEnum
from tests.support.utils import temp_folder
from visivo.commands.utils import create_file_database
import os


def test_Runner_trace_with_default():
    output_dir = temp_folder()
    target = Target(
        name="target", database=f"{output_dir}/test.db", type=TypeEnum.sqlite
    )
    model = SqlModelFactory(name="model1", target=None)
    trace = TraceFactory(name="trace1", model=model)
    defaults = DefaultsFactory(target_name=target.name)
    trace.model.name = "second_model"
    project = ProjectFactory(
        defaults=defaults, targets=[target], traces=[trace], dashboards=[]
    )

    create_file_database(url=target.url(), output_dir=output_dir)

    os.makedirs(f"{output_dir}/{trace.name}", exist_ok=True)
    with open(f"{output_dir}/{trace.name}/query.sql", "w") as fp:
        fp.write("select *, 'values' as 'cohort_on' from test_table")

    runner = Runner(
        traces=[trace],
        project=project,
        output_dir=output_dir,
    )
    runner.run()
    assert os.path.exists(f"{output_dir}/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/{trace.name}/data.json")


def test_Runner_trace_given_target():
    output_dir = temp_folder()
    target = Target(database=f"{output_dir}/test.db", type=TypeEnum.sqlite)
    model = SqlModelFactory(name="model1", target=target)
    trace = TraceFactory(name="trace1", model=model)
    trace.model.name = "second_model"
    project = ProjectFactory(targets=[], traces=[trace], dashboards=[])

    create_file_database(url=target.url(), output_dir=output_dir)

    os.makedirs(f"{output_dir}/{trace.name}", exist_ok=True)
    with open(f"{output_dir}/{trace.name}/query.sql", "w") as fp:
        fp.write("select *, 'values' as 'cohort_on' from test_table")

    runner = Runner(
        traces=[trace],
        project=project,
        output_dir=output_dir,
    )
    runner.run()
    assert os.path.exists(f"{output_dir}/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/{trace.name}/data.json")


def test_runner_message():
    details = "Testing Details"
    status = "Failure"
    full_path = os.getcwd()
    error_msg = "You did something wrong."

    message = format_message(
        details=details, status=status, full_path=full_path, error_msg=error_msg
    )
    assert "query: ." in message
    assert (
        "Testing Details ..........................................................................[Failure]"
        in message
    )
    assert "error: You did something wrong." in message


def test_runner_with_csv_script_model():
    output_dir = temp_folder()
    model = CsvScriptModelFactory(name="csv_script_model")
    trace = TraceFactory(name="trace1", model=model)
    project = ProjectFactory(targets=[], traces=[trace], dashboards=[])

    os.makedirs(f"{output_dir}/{trace.name}", exist_ok=True)
    with open(f"{output_dir}/{trace.name}/query.sql", "w") as fp:
        fp.write(f"select *, 'values' as 'cohort_on' from {model.name}")

    runner = Runner(
        traces=[trace],
        project=project,
        output_dir=output_dir,
    )
    runner.run()
    assert os.path.exists(f"{output_dir}/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/{trace.name}/data.json")
    assert os.path.exists(f"{output_dir}/{model.name}.sqlite")
