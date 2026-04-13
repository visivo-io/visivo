from visivo.models.project import Project
from visivo.models.insight import Insight
from visivo.models.test import Test
from tests.factories.model_factories import (
    AlertFactory,
    DashboardFactory,
    InsightFactory,
    ProjectFactory,
)

from visivo.testing.runner import Runner
from tests.support.utils import temp_folder
import json
import os


def test_TestQueryStringFactory_errors(capsys):
    insight_data = {
        "name": "two_test_insight",
        "props": {
            "type": "scatter",
            "x": "?{x}",
            "y": "?{y}",
        },
    }
    insight = Insight(**insight_data)

    test1 = Test(
        name="test1",
        assertions=[">{ sum( ${ ref(two_test_insight).props.x } ) == 1 }"],
    )
    test2 = Test(
        name="test2",
        assertions=[">{ all( ${ ref(two_test_insight).props.x } ) < 7 }"],
    )

    output_dir = temp_folder()
    folders = f"{output_dir}/two_test_insight"
    data = {"two_test_insight": {"props.x": [1, 2, 3, 4, 5, 6], "props.y": [1, 1, 2, 3, 5, 8]}}
    os.makedirs(folders, exist_ok=True)
    json_file = open(f"{folders}/data.json", "w")
    json_file.write(json.dumps(data))
    json_file.close()

    alert = AlertFactory()
    project = ProjectFactory(insights=[insight], dashboards=[DashboardFactory()], alerts=[alert])

    project = Project(**project.model_dump())
    dag = project.dag()

    tests = [test1, test2]
    for i, t in enumerate(tests):
        t.path = f"project.tests[{i}]"

    Runner(
        tests=tests,
        project=project,
        output_dir=output_dir,
        dag=dag,
    ).run()
    captured = capsys.readouterr()
    assert "project.tests[0]: >{ sum( ${ ref(two_test_insight).props.x } ) == 1 }" in captured.out
    assert "project.tests[1]:" not in captured.out
    assert project.alerts[0].destinations[0].called
