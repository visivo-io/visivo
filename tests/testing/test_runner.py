from visivo.models.targets.sqlite_target import SqliteTarget
from visivo.models.trace import Trace
from ..factories.model_factories import (
    AlertFactory,
    ProjectFactory,
)

from visivo.testing.runner import Runner
from tests.support.utils import temp_folder
from visivo.commands.utils import create_file_database
import json
import os


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
            {"logic": "assert_that(numpy.sum(trace.props.x)).is_equal_to(1)"},
            {
                "logic": "assert_that(numpy.all(numpy.asarray(trace.props.x) < 7)).is_true()"
            },
        ],
    }
    trace = Trace(**data)

    output_dir = temp_folder()
    folders = f"{output_dir}/two_test_trace"
    data = {"trace": {"props.x": [1, 2, 3, 4, 5, 6], "props.y": [1, 1, 2, 3, 5, 8]}}
    os.makedirs(folders, exist_ok=True)
    json_file = open(f"{folders}/data.json", "w")
    json_file.write(json.dumps(data))
    json_file.close()

    alert = AlertFactory()
    project = ProjectFactory(traces=[trace], dashboards=[])

    Runner(
        traces=[trace],
        project=project,
        output_dir=output_dir,
        alerts=[alert],
    ).run()
    captured = capsys.readouterr()
    assert (
        "two_test_trace.test[0]: Expected <21> to be equal to <1>, but was not."
        in captured.out
    )
    assert "two_test_trace[1]:" not in captured.out
    assert alert.called
