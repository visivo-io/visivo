from tests.factories.model_factories import (
    DefaultsFactory,
    ModelFactory,
    ProjectFactory,
)
from visivo.query.runner import Runner
from tests.factories.model_factories import TraceFactory
from visivo.models.target import Target, TypeEnum
from tests.support.utils import temp_folder
from visivo.commands.utils import create_file_database
import os


def test_Runner_trace_with_default():
    output_dir = temp_folder()
    target = Target(database=f"{output_dir}/test.db", type=TypeEnum.sqlite)
    model = ModelFactory(name="model1", target=None)
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
    model = ModelFactory(name="model1", target=target)
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
