from visivo.models.project import Project
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
            "x": "?{x}",
            "y": "?{y}",
        },
        "model": {"sql": "select * from test_table", "source": "ref(source)"},
        "tests": [
            {
                "name": "test1",
                "assertions": [">{ sum( ${ ref(two_test_trace).props.x } ) == 1 }"],
            },
            {
                "name": "test2",
                "assertions": [">{ all( ${ ref(two_test_trace).props.x } ) < 7 }"],
            },
        ],
    }
    trace = Trace(**data)
    output_dir = temp_folder()
    folders = f"{output_dir}/two_test_trace"
    data = {"two_test_trace": {"props.x": [1, 2, 3, 4, 5, 6], "props.y": [1, 1, 2, 3, 5, 8]}}
    os.makedirs(folders, exist_ok=True)
    json_file = open(f"{folders}/data.json", "w")
    json_file.write(json.dumps(data))
    json_file.close()

    alert = AlertFactory()
    project = ProjectFactory(traces=[trace], dashboards=[DashboardFactory()], alerts=[alert])

    # Trigger set_path_on_named_models
    project = Project(**project.model_dump())
    dag = project.dag()
    Runner(
        tests=project.traces[0].tests,
        project=project,
        output_dir=output_dir,
        dag=dag,
    ).run()
    captured = capsys.readouterr()
    assert (
        "project.traces[0].tests[0]: >{ sum( ${ ref(two_test_trace).props.x } ) == 1 }"
        in captured.out
    )
    assert "project.traces[0].tests[1]:" not in captured.out
    assert project.alerts[0].destinations[0].called
