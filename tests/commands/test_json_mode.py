"""
``--json`` on compile, run and test: parseable, and the same shape whether the
command succeeded or failed.
"""

import json
import os

from click.testing import CliRunner

from tests.factories.model_factories import (
    ChartFactory,
    DashboardFactory,
    InsightFactory,
    ItemFactory,
    ProjectFactory,
    RowFactory,
    SqlModelFactory,
)
from tests.support.utils import temp_folder, temp_yml_file
from visivo.commands.compile import compile
from visivo.commands.run import run
from visivo.commands.test import test
from visivo.commands.utils import create_file_database
from visivo.parsers.file_names import PROJECT_FILE_NAME
from visivo.server.hot_reload_server import HotReloadServer

runner = CliRunner()

ENVELOPE_KEYS = {
    "visivo_json_version",
    "command",
    "success",
    "cli_version",
    "duration_ms",
    "result",
    "errors",
}
ERROR_KEYS = {"code", "name", "message", "file", "line", "object_path", "details"}


def parsed(response):
    """stdout must be the JSON document and nothing else."""
    assert response.stdout.strip(), "no JSON document on stdout"
    document = json.loads(response.stdout)
    assert set(document) == ENVELOPE_KEYS
    assert document["visivo_json_version"] == 1
    for error in document["errors"]:
        assert set(error) == ERROR_KEYS
    return document


def runnable_project(**kwargs):
    model = SqlModelFactory(name="model", source="ref(source)")
    insight = InsightFactory(name="insight", model=model)
    chart = ChartFactory(name="chart", insights=[insight])
    item = ItemFactory(name="item", chart=chart)
    row = RowFactory(name="row", items=[item])
    dashboard = DashboardFactory(name="dashboard", rows=[row])
    return ProjectFactory(models=[model], dashboards=[dashboard], **kwargs)


def write_project(project):
    path = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    return os.path.dirname(path)


def write_yaml(document):
    path = temp_yml_file(dict=document, name=PROJECT_FILE_NAME)
    return os.path.dirname(path)


DANGLING_REF_PROJECT = {
    "name": "dangling",
    "sources": [{"name": "source", "type": "duckdb", "database": "tmp/dangling.duckdb"}],
    "models": [{"name": "model", "sql": "select 1 as one"}],
    "insights": [
        {
            "name": "broken_insight",
            "props": {
                "type": "bar",
                "x": "?{ ${ref(no_such_model).one} }",
                "y": "?{ count(*) }",
            },
        }
    ],
}


# --------------------------------------------------------------------------
# compile
# --------------------------------------------------------------------------


def test_compile_json_success():
    output_dir = temp_folder()
    project = runnable_project()
    working_dir = write_project(project)

    response = runner.invoke(
        compile, ["-w", working_dir, "-o", output_dir, "-s", "source", "--json"]
    )

    document = parsed(response)
    assert response.exit_code == 0
    assert document["command"] == "compile"
    assert document["success"] is True
    assert document["errors"] == []
    assert document["result"]["project_name"] == project.name
    assert document["result"]["objects"]["models"] == ["model"]
    assert document["result"]["objects"]["dashboards"] == ["dashboard"]
    assert document["result"]["object_counts"]["models"] == 1
    assert isinstance(document["duration_ms"], int)


def test_compile_json_failure_carries_name_message_file_and_line():
    output_dir = temp_folder()
    working_dir = write_yaml(DANGLING_REF_PROJECT)

    response = runner.invoke(
        compile, ["-w", working_dir, "-o", output_dir, "-s", "source", "--json"]
    )

    document = parsed(response)
    assert response.exit_code == 1
    assert document["success"] is False
    assert len(document["errors"]) == 1
    error = document["errors"][0]
    assert error["code"] == "bad_reference"
    assert error["name"] == "broken_insight"
    assert "no_such_model" in error["message"]
    assert error["file"].endswith(PROJECT_FILE_NAME)
    assert isinstance(error["line"], int) and error["line"] > 0
    assert error["object_path"] == "project.insights[0]"


def test_compile_json_failure_on_an_unknown_key():
    output_dir = temp_folder()
    document = json.loads(json.dumps(DANGLING_REF_PROJECT))
    document["insights"][0]["props"]["x"] = "?{ ${ref(model).one} }"
    document["models"][0]["not_a_field"] = 1
    working_dir = write_yaml(document)

    response = runner.invoke(
        compile, ["-w", working_dir, "-o", output_dir, "-s", "source", "--json"]
    )

    payload = parsed(response)
    assert response.exit_code == 1
    error = payload["errors"][0]
    assert error["code"] == "extra_forbidden"
    assert error["name"] == "model"
    assert error["file"].endswith(PROJECT_FILE_NAME)
    assert isinstance(error["line"], int)


def test_compile_json_keeps_human_output_off_stdout():
    output_dir = temp_folder()
    working_dir = write_project(runnable_project())

    response = runner.invoke(
        compile, ["-w", working_dir, "-o", output_dir, "-s", "source", "--json"]
    )

    assert "Compiling" in response.stderr
    assert "Compiling" not in response.stdout


def test_compile_without_json_is_unchanged():
    output_dir = temp_folder()
    working_dir = write_project(runnable_project())

    response = runner.invoke(compile, ["-w", working_dir, "-o", output_dir, "-s", "source"])

    assert response.exit_code == 0
    assert "Compiling" in response.output
    assert "Done" in response.output


# --------------------------------------------------------------------------
# run
# --------------------------------------------------------------------------


def test_run_json_success():
    output_dir = temp_folder()
    project = runnable_project()
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    working_dir = write_project(project)

    response = runner.invoke(
        run,
        [
            "-w",
            working_dir,
            "-o",
            output_dir,
            "-s",
            "source",
            "-p",
            str(HotReloadServer.find_available_port()),
            "--json",
        ],
    )

    document = parsed(response)
    assert response.exit_code == 0
    assert document["command"] == "run"
    assert document["success"] is True
    assert document["errors"] == []
    assert document["result"]["job_counts"]["failed"] == 0
    assert document["result"]["job_counts"]["total"] > 0
    for job in document["result"]["jobs"]:
        assert set(job) == {"name", "type", "success", "summary", "error", "artifact"}
        assert job["success"] is True
        assert "..." not in (job["summary"] or "")


def test_run_json_failure_reports_the_failing_job():
    output_dir = temp_folder()
    project = runnable_project()
    project.models[0].sql = "select * from a_table_that_is_not_there"
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    working_dir = write_project(project)

    response = runner.invoke(
        run,
        [
            "-w",
            working_dir,
            "-o",
            output_dir,
            "-s",
            "source",
            "-p",
            str(HotReloadServer.find_available_port()),
            "--json",
        ],
    )

    document = parsed(response)
    assert response.exit_code == 1
    assert document["success"] is False
    assert document["result"]["job_counts"]["failed"] > 0
    assert document["errors"], "a failed run must carry structured errors, not just exit 1"
    codes = {error["code"] for error in document["errors"]}
    assert codes == {"job_failed"}
    assert all(error["name"] for error in document["errors"])
    assert all(error["message"] for error in document["errors"])

    # `error` is recovered by parsing the runner's log text, and `run_errors`
    # falls back to the "Failed job for <name>" summary when that comes up empty.
    failed = [job for job in document["result"]["jobs"] if not job["success"]]
    assert failed, "the run reported no failing job"
    for job in failed:
        assert job["error"], f"failing job {job['name']} carries no error text"
        assert job["error"] != job["summary"]
        assert not job["error"].startswith("Failed job for")
        assert len(job["error"]) > len(job["summary"])
    by_name = {job["name"]: job for job in failed}
    for error in document["errors"]:
        assert not error["message"].startswith("Failed job for")
        assert error["message"] == by_name[error["name"]]["error"]
        # `file` is a path a consumer opens, or null -- never a log-line prefix.
        assert error["file"] is None or not error["file"].startswith(("query", "database"))


def test_run_without_json_still_exits_non_zero_on_failure():
    """`run --json` runs the DAG soft so it can report every failure; the plain
    path must keep exiting 1, or a broken pipeline goes green in CI."""
    output_dir = temp_folder()
    project = runnable_project()
    project.models[0].sql = "select * from a_table_that_is_not_there"
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    working_dir = write_project(project)

    response = runner.invoke(
        run,
        [
            "-w",
            working_dir,
            "-o",
            output_dir,
            "-s",
            "source",
            "-p",
            str(HotReloadServer.find_available_port()),
        ],
    )

    assert response.exit_code == 1


def test_run_json_keeps_the_artifact_sweep_off_stdout():
    """The end-of-run artifact sweep logs through Logger, which writes to
    stdout. Under --json its line has to reach stderr like every other one, and
    the sweep still has to happen."""
    output_dir = temp_folder()
    project = runnable_project()
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    arguments = [
        "-o",
        output_dir,
        "-s",
        "source",
        "-p",
        str(HotReloadServer.find_available_port()),
    ]

    first = runner.invoke(run, ["-w", write_project(project)] + arguments)
    assert first.exit_code == 0
    orphaned = os.path.join(output_dir, "main", "insights", "insight.json")
    assert os.path.exists(orphaned)

    document = json.loads(project.model_dump_json())
    document["dashboards"][0]["rows"][0]["items"][0]["chart"]["insights"][0][
        "name"
    ] = "insight_renamed"
    response = runner.invoke(run, ["-w", write_yaml(document)] + arguments + ["--json"])

    parsed(response)
    assert response.exit_code == 0
    assert not os.path.exists(orphaned), "the sweep did not run"
    assert "no longer in the project" in response.stderr
    assert "no longer in the project" not in response.stdout


def test_run_json_and_compile_json_share_the_envelope():
    output_dir = temp_folder()
    project = runnable_project()
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    working_dir = write_project(project)

    compiled = parsed(
        runner.invoke(compile, ["-w", working_dir, "-o", output_dir, "-s", "source", "--json"])
    )
    ran = parsed(
        runner.invoke(
            run,
            [
                "-w",
                working_dir,
                "-o",
                output_dir,
                "-s",
                "source",
                "-p",
                str(HotReloadServer.find_available_port()),
                "--json",
            ],
        )
    )
    assert set(compiled) == set(ran)
    assert compiled["cli_version"] == ran["cli_version"]


# --------------------------------------------------------------------------
# test
# --------------------------------------------------------------------------


def _project_with_assertions(assertions):
    from visivo.models.test import Test

    project = runnable_project()
    project.tests = [
        Test(name=f"assertion-{index}", assertions=[assertion])
        for index, assertion in enumerate(assertions)
    ]
    return project


def _write_insight_data(output_dir, insight_name="insight"):
    folder = f"{output_dir}/{insight_name}"
    os.makedirs(folder, exist_ok=True)
    with open(f"{folder}/data.json", "w") as file:
        file.write(json.dumps({insight_name: {"props.x": [1, 2, 3], "props.y": [1, 2, 3]}}))


def test_test_json_success():
    output_dir = temp_folder()
    project = _project_with_assertions([">{ sum( ${ ref(insight).props.x } ) == 6 }"])
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    working_dir = write_project(project)
    _write_insight_data(output_dir)

    response = runner.invoke(test, ["-w", working_dir, "-o", output_dir, "-s", "source", "--json"])

    document = parsed(response)
    assert response.exit_code == 0
    assert document["command"] == "test"
    assert document["success"] is True
    assert document["errors"] == []
    assert document["result"]["test_counts"] == {"passed": 1, "failed": 0, "total": 1}
    assert document["result"]["tests"][0]["name"] == "assertion-0"
    assert document["result"]["tests"][0]["passed"] is True


def test_test_json_failure_reports_each_failing_assertion():
    output_dir = temp_folder()
    project = _project_with_assertions(
        [
            ">{ sum( ${ ref(insight).props.x } ) == 6 }",
            ">{ sum( ${ ref(insight).props.x } ) == 999 }",
        ]
    )
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    working_dir = write_project(project)
    _write_insight_data(output_dir)

    response = runner.invoke(test, ["-w", working_dir, "-o", output_dir, "-s", "source", "--json"])

    document = parsed(response)
    assert response.exit_code == 1
    assert document["success"] is False
    assert document["result"]["test_counts"] == {"passed": 1, "failed": 1, "total": 2}
    assert len(document["errors"]) == 1
    assert document["errors"][0]["code"] == "test_failed"
    assert document["errors"][0]["name"] == "assertion-1"
    assert "999" in document["errors"][0]["message"]


def test_test_json_success_and_failure_have_the_same_shape():
    output_dir = temp_folder()
    passing = _project_with_assertions([">{ sum( ${ ref(insight).props.x } ) == 6 }"])
    create_file_database(url=passing.sources[0].url(), output_dir=output_dir)
    _write_insight_data(output_dir)
    passing_document = parsed(
        runner.invoke(
            test, ["-w", write_project(passing), "-o", output_dir, "-s", "source", "--json"]
        )
    )

    failing = _project_with_assertions([">{ sum( ${ ref(insight).props.x } ) == 999 }"])
    failing_document = parsed(
        runner.invoke(
            test, ["-w", write_project(failing), "-o", output_dir, "-s", "source", "--json"]
        )
    )

    assert set(passing_document) == set(failing_document)
    assert set(passing_document["result"]) == set(failing_document["result"])
    assert set(passing_document["result"]["tests"][0]) == set(
        failing_document["result"]["tests"][0]
    )


def test_test_without_json_still_exits_non_zero_on_failure():
    output_dir = temp_folder()
    project = _project_with_assertions([">{ sum( ${ ref(insight).props.x } ) == 999 }"])
    create_file_database(url=project.sources[0].url(), output_dir=output_dir)
    working_dir = write_project(project)
    _write_insight_data(output_dir)

    response = runner.invoke(test, ["-w", working_dir, "-o", output_dir, "-s", "source"])

    assert response.exit_code == 1
