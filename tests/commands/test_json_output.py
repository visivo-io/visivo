import io
import json

import click
import pytest
from pydantic import BaseModel, ValidationError

from visivo.commands.json_output import (
    ERROR_KEY_ORDER,
    VISIVO_JSON_VERSION,
    emit,
    envelope,
    errors_from_exception,
    json_command,
    parse_job_message,
    run_errors,
    run_result,
    strip_ansi,
)


def test_compile_result_covers_every_authorable_collection():
    """`compile --json` must not silently omit a collection the schema advertises."""
    from visivo.commands.json_output import _PROJECT_COLLECTIONS
    from visivo.commands.schema_phase import CORE_PROJECT_PROPERTIES
    from visivo.models.project import Project

    properties = Project.model_json_schema(by_alias=False)["properties"]
    list_valued = {
        name for name in CORE_PROJECT_PROPERTIES if properties.get(name, {}).get("type") == "array"
    }
    # `includes` holds file references, not named objects -- an Include has a
    # path, not a name, so reporting it would be a column of nulls.
    assert set(_PROJECT_COLLECTIONS) == list_valued - {"includes"}


def test_envelope_always_carries_every_key():
    payload = envelope(command="compile", success=True)

    assert set(payload) == {
        "visivo_json_version",
        "command",
        "success",
        "cli_version",
        "duration_ms",
        "result",
        "errors",
    }
    assert payload["visivo_json_version"] == VISIVO_JSON_VERSION
    assert payload["result"] == {}
    assert payload["errors"] == []


def test_emit_writes_exactly_one_line_of_json():
    stream = io.StringIO()

    emit({"a": 1}, stream=stream)

    assert stream.getvalue() == '{"a": 1}\n'


def test_strip_ansi_removes_colour_codes():
    assert strip_ansi("\033[32mgreen\033[0m") == "green"
    assert strip_ansi(None) == ""


def test_parse_job_message_undoes_the_alignment_padding():
    parsed = parse_job_message(
        "Wrote schema for model ev_sales ......................[SUCCESS 0.02s]"
        "\n\ttarget/main/schemas/ev_sales.json"
    )

    assert parsed["summary"] == "Wrote schema for model ev_sales"
    assert parsed["status"] == "SUCCESS"
    assert parsed["error"] is None
    assert parsed["artifact"] == "target/main/schemas/ev_sales.json"


def test_parse_job_message_pulls_out_the_error_and_the_query_path():
    parsed = parse_job_message(
        "Failed job for insight kpi ....[FAILURE 0.0s]"
        "\n\t\033[2mquery: target/insights/kpi/query.sql\033[0m"
        "\n\t\033[2merror: Exception(\"Column 'x' not found\")\033[0m"
    )

    assert parsed["summary"] == "Failed job for insight kpi"
    assert parsed["status"] == "FAILURE"
    assert parsed["artifact"] == "target/insights/kpi/query.sql"
    assert "Column 'x' not found" in parsed["error"]


def test_parse_job_message_survives_an_unpadded_message():
    parsed = parse_job_message("something happened")

    assert parsed == {
        "summary": "something happened",
        "status": None,
        "error": None,
        "artifact": None,
    }


class _Item:
    def __init__(self, name, path=None):
        self.name = name
        self.path = path


class _JobResult:
    def __init__(self, item, success, message, error_details=None):
        self.item = item
        self.success = success
        self.message = message
        self.error_details = error_details


class _Runner:
    def __init__(self, successful, failed):
        self.successful_job_results = successful
        self.failed_job_results = failed


class _Project:
    name = "p"


def test_run_result_and_run_errors_agree():
    failed = _JobResult(
        item=_Item("kpi", "project.insights[0]"),
        success=False,
        message="Failed job for insight kpi ....[FAILURE 0.0s]\n\terror: boom",
        error_details={"kind": "missing_relation"},
    )
    succeeded = _JobResult(
        item=_Item("model"), success=True, message="Ran model ....[SUCCESS 0.1s]"
    )
    runner = _Runner(successful=[succeeded], failed=[failed])

    result = run_result(runner=runner, project=_Project(), output_dir="target")
    errors = run_errors(runner)

    assert result["job_counts"] == {"succeeded": 1, "failed": 1, "total": 2}
    assert [job["name"] for job in result["jobs"]] == ["model", "kpi"]
    assert len(errors) == 1
    assert errors[0]["code"] == "job_failed"
    assert errors[0]["name"] == "kpi"
    assert errors[0]["message"] == "boom"
    assert errors[0]["object_path"] == "project.insights[0]"
    assert errors[0]["details"] == {"kind": "missing_relation"}


def test_errors_from_a_click_exception():
    errors = errors_from_exception(click.ClickException("bad yaml at file.yml:3"))

    assert errors == [
        {
            "code": "cli_error",
            "name": None,
            "message": "bad yaml at file.yml:3",
            "file": None,
            "line": None,
            "object_path": None,
            "details": None,
        }
    ]


def test_errors_from_an_arbitrary_exception():
    errors = errors_from_exception(RuntimeError("nope"))

    assert errors[0]["code"] == "RuntimeError"
    assert errors[0]["message"] == "nope"
    assert set(errors[0]) == set(ERROR_KEY_ORDER)


def test_errors_from_a_bare_pydantic_validation_error():
    class Model(BaseModel):
        count: int

    with pytest.raises(ValidationError) as raised:
        Model(count="not-a-number")

    errors = errors_from_exception(raised.value)

    assert len(errors) == 1
    assert errors[0]["code"] == "int_parsing"
    assert errors[0]["object_path"] == "count"
    assert errors[0]["file"] is None


def test_json_command_emits_on_success(capsys):
    with json_command("compile") as state:
        print("a human log line")
        state["result"] = {"ok": True}

    captured = capsys.readouterr()
    payload = json.loads(captured.out)
    assert payload["success"] is True
    assert payload["result"] == {"ok": True}
    assert "a human log line" in captured.err
    assert "a human log line" not in captured.out


def test_json_command_turns_an_exception_into_the_envelope(capsys):
    with pytest.raises(SystemExit) as raised:
        with json_command("compile"):
            raise RuntimeError("kaboom")

    assert raised.value.code == 1
    payload = json.loads(capsys.readouterr().out)
    assert payload["success"] is False
    assert payload["errors"][0]["message"] == "kaboom"


def test_json_command_still_emits_when_the_body_calls_sys_exit(capsys):
    """An agent that got no JSON cannot tell a crash from a clean run."""
    import sys

    with pytest.raises(SystemExit) as raised:
        with json_command("run"):
            sys.exit(3)

    assert raised.value.code == 3
    payload = json.loads(capsys.readouterr().out)
    assert payload["success"] is False
    assert payload["errors"][0]["code"] == "exited"


def test_json_command_exits_non_zero_when_the_body_records_errors(capsys):
    with pytest.raises(SystemExit) as raised:
        with json_command("test") as state:
            state["errors"] = [{"code": "test_failed"}]

    assert raised.value.code == 1
    assert json.loads(capsys.readouterr().out)["success"] is False
