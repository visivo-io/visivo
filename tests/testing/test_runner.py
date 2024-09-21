from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.trace import Trace
from ..factories.model_factories import (
    AlertFactory,
    DashboardFactory,
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
        "model": {"sql": "select * from test_table", "source": "ref(source)"},
        "tests": [
            {"name": "test1", "assertions": [">{ sum( ${ trace.props.x } ) == 1 }"]},
            {"name": "test2", "assertions": [">{ all( ${ trace.props.x } ) < 7 }"]},
        ],
    }
    trace = Trace(**data)
    tests = trace.tests

    output_dir = temp_folder()
    folders = f"{output_dir}/two_test_trace"
    data = {"trace": {"props.x": [1, 2, 3, 4, 5, 6], "props.y": [1, 1, 2, 3, 5, 8]}}
    os.makedirs(folders, exist_ok=True)
    json_file = open(f"{folders}/data.json", "w")
    json_file.write(json.dumps(data))
    json_file.close()

    alert = AlertFactory()
    project = ProjectFactory(traces=[trace], dashboards=[DashboardFactory()])
    dag = project.dag()
    Runner(
        tests=tests,
        project=project,
        output_dir=output_dir,
        dag=dag,
    ).run()
    captured = capsys.readouterr()
    assert (
        "two_test_trace.test[0]: Expected <21> to be equal to <1>, but was not."
        in captured.out
    )
    assert "two_test_trace.test[1]:" not in captured.out
    assert alert.called
