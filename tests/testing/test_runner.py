from visivo.models.targets.sqlite_target import SqliteTarget
from ..factories.model_factories import (
    AlertFactory,
    ProjectFactory,
)
from visivo.models.trace import Trace
from visivo.testing.runner import Runner
from tests.support.utils import temp_folder
from visivo.commands.utils import create_file_database


def test_TestQueryStringFactory_errors(capsys):
    data = {
        "name": "two_test_trace",
        "props": {
            "type": "scatter",
            "x": "query(x)",
            "y": "query(y)",
        },
        "model": {"sql": "select * from test_table", "target": "ref(target)"},
        "tests": [
            {"coordinate_exists": {"coordinates": {"x": 3, "y": 2}}},
            {"coordinate_exists": {"coordinates": {"x": 19, "y": 26}}},
        ],
    }
    trace = Trace(**data)

    output_dir = temp_folder()
    alert = AlertFactory()
    target = SqliteTarget(
        name="target",
        database=f"{output_dir}/test.db",
    )
    project = ProjectFactory(targets=[target], traces=[trace], dashboards=[])

    create_file_database(url=target.url(), output_dir=output_dir)
    Runner(
        traces=[trace],
        project=project,
        output_dir=output_dir,
        alerts=[alert],
    ).run()
    captured = capsys.readouterr()
    assert (
        "two_test_trace-coordinate_exists-2: coordinates x=19, y=26 were not found in any trace cohort"
        in captured.out
    )
    assert alert.called
