from visivo.query.runner import Runner
from tests.factories.model_factories import TraceFactory
from visivo.models.target import Target, TypeEnum
from tests.support.utils import create_file_database, temp_folder
import uuid
import os


def test_Runner():
    output_dir = temp_folder()
    target = Target(database=f"{output_dir}/test.db", type=TypeEnum.sqlite)
    create_file_database(url=target.url(), output_dir=output_dir)

    trace = TraceFactory(name="trace1")

    os.makedirs(f"{output_dir}/{trace.name}", exist_ok=True)
    with open(f"{output_dir}/{trace.name}/query.sql", "w") as fp:
        fp.write("select *, 'values' as 'cohort_on' from test_table")

    runner = Runner(traces=[trace], target=target, output_dir=output_dir)
    runner.run()
    assert os.path.exists(f"{output_dir}/{trace.name}/query.sql")
    assert os.path.exists(f"{output_dir}/{trace.name}/data.json")
