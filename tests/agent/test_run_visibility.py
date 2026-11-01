"""Telling the agent whether its work actually ran (VIS-1338).

A write lands in the draft tier, which says nothing about whether the SQL it
authored is valid against the warehouse. `validate_model` checks the config
shape; only a run finds the column that does not exist. Without these tools an
agent authors confidently and never learns it was wrong.
"""

import pytest

from visivo.agent.tools import RUN_LOG_TAIL, ToolError, call
from visivo.server.managers.run_manager import RunManager, RunState


@pytest.fixture
def runs(integration_app):
    """RunManager is a process-wide singleton, so a test that did not reset it
    would read the previous test's runs — and `list` is ordered, so the failure
    would depend on test order."""
    manager = RunManager.instance()
    manager._init()
    integration_app.run_manager = manager
    yield manager
    manager._init()


class TestListing:
    def test_no_runs_is_an_answer_not_an_error(self, integration_app, runs):
        result = call(integration_app, "list_runs", {})

        assert result["runs"] == []
        assert result["latest"] is None

    def test_the_latest_is_called_out(self, integration_app, runs):
        runs.create(dag_filter="+first+")
        second = runs.create(dag_filter="+second+")

        result = call(integration_app, "list_runs", {})

        assert result["latest"]["id"] == second.id
        assert result["latest"]["dag_filter"] == "+second+"

    def test_a_failure_carries_its_structured_error(self, integration_app, runs):
        """`error_json` is the phase that failed. An agent that only saw
        'failed' would have to guess whether it authored bad SQL or the
        warehouse was down."""
        run = runs.create(dag_filter="+orders+")
        runs.set_state(run.id, RunState.FAILED, error_json={"phase": "run", "error": "boom"})

        [entry] = call(integration_app, "list_runs", {})["runs"]

        assert entry["state"] == "failed"
        assert entry["error_json"]["error"] == "boom"


class TestReadingOne:
    def test_it_defaults_to_the_most_recent(self, integration_app, runs):
        """What an agent asking after its own write actually wants."""
        runs.create(dag_filter="+old+")
        newest = runs.create(dag_filter="+new+")

        assert call(integration_app, "get_run", {})["id"] == newest.id

    def test_the_log_comes_back(self, integration_app, runs):
        run = runs.create(dag_filter="+orders+")
        runs.set_state(run.id, RunState.FAILED, logs="Binder Error: no column 'totl'")

        result = call(integration_app, "get_run", {"run_id": run.id})

        assert "no column 'totl'" in result["logs"]

    def test_a_long_log_is_tailed_not_dropped(self, integration_app, runs):
        """The failure is at the END. Sending the head would spend the context
        on the part that went well and cut off the part that did not."""
        run = runs.create(dag_filter="+orders+")
        runs.set_state(run.id, RunState.FAILED, logs=("x" * RUN_LOG_TAIL) + "THE ACTUAL ERROR")

        result = call(integration_app, "get_run", {"run_id": run.id})

        assert "THE ACTUAL ERROR" in result["logs"]
        assert len(result["logs"]) <= RUN_LOG_TAIL
        assert result["logs_truncated"] is True

    def test_an_unknown_id_refuses_clearly(self, integration_app, runs):
        with pytest.raises(ToolError) as refused:
            call(integration_app, "get_run", {"run_id": "nope"})
        assert "nope" in str(refused.value)

    def test_asking_before_any_run_refuses_rather_than_inventing_one(self, integration_app, runs):
        with pytest.raises(ToolError):
            call(integration_app, "get_run", {})


class TestTheseAreReadsOnly:
    def test_neither_tool_can_start_a_run(self, integration_app, runs):
        """Triggering a run executes SQL against real sources and can run a
        source's seed subprocesses — the escalation path VIS-1340 identified.
        Reading is safe; starting is a separate decision."""
        call(integration_app, "list_runs", {})
        runs.create(dag_filter="+x+")
        before = len(runs.list())

        call(integration_app, "list_runs", {})
        call(integration_app, "get_run", {})

        assert len(runs.list()) == before


class TestCheckRuns:
    """The done-check. A write that changes data starts a build on a background
    thread, so asking straight after a write only ever sees `queued` — and
    there is no sleep tool to wait with.
    """

    def test_a_clean_project_is_ok(self, integration_app, runs):
        result = call(integration_app, "check_runs", {})

        assert result["ok"] is True
        assert result["runs"] == 0

    def test_a_succeeded_run_is_ok(self, integration_app, runs):
        run = runs.create(dag_filter="+orders+")
        runs.set_state(run.id, RunState.SUCCEEDED, logs="built")

        result = call(integration_app, "check_runs", {})

        assert result["ok"] is True
        assert result["state"] == "succeeded"
        assert result["run_id"] == run.id

    def test_a_failed_run_is_not_ok_and_says_why(self, integration_app, runs):
        run = runs.create(dag_filter="+orders+")
        runs.set_state(
            run.id,
            RunState.FAILED,
            logs="orders " + "." * 50 + " FAILED: no column 'total'",
            error_json={
                "phase": "run",
                "diagnostics": [{"code": "query_execution_failed", "message": "no column 'total'"}],
            },
        )

        result = call(integration_app, "check_runs", {})

        assert result["ok"] is False
        assert result["state"] == "failed"
        assert result["diagnostics"][0]["code"] == "query_execution_failed"
        assert "no column 'total'" in result["logs"]

    def test_it_waits_for_a_build_in_flight(self, integration_app, runs):
        """The run the agent most needs a verdict on is the one its own write
        just started."""
        import threading

        run = runs.create(dag_filter="+orders+")

        def finish():
            runs.set_state(run.id, RunState.SUCCEEDED, logs="built")

        threading.Timer(0.6, finish).start()

        result = call(integration_app, "check_runs", {})

        assert result["settled"] is True
        assert result["ok"] is True

    def test_a_build_that_never_settles_is_not_a_failure(self, integration_app, runs):
        """A slow build is still a build. Reporting it as failed would have the
        agent 'fix' something that was fine."""
        from visivo.agent import runs as run_helpers

        run = runs.create(dag_filter="+orders+")
        runs.set_state(run.id, RunState.RUNNING)

        result = run_helpers.verdict(integration_app, timeout=0.1)

        assert result["settled"] is False
        assert result["ok"] is False
        assert result["state"] == "running"
        assert "diagnostics" not in result

    def test_the_log_is_tailed_like_get_run(self, integration_app, runs):
        run = runs.create(dag_filter="+orders+")
        runs.set_state(
            run.id,
            RunState.FAILED,
            logs="x" * (RUN_LOG_TAIL + 500) + "the actual error",
            error_json={"phase": "run"},
        )

        result = call(integration_app, "check_runs", {})

        assert len(result["logs"]) == RUN_LOG_TAIL
        assert result["logs"].endswith("the actual error")
        assert result["logs_truncated"] is True

    def test_it_works_against_a_cloud_run_manager(self, integration_app, runs):
        """Cloud hands the tools a `RemoteRunManager`. If this needed a branch,
        the cloud agent would disagree with the local one about whether the
        project builds."""
        from visivo.agent.remote import RemoteRunManager

        class _Client:
            def runs(self):
                return [
                    {
                        "id": "cloud-1",
                        "state": "failed",
                        "logs": "FAILED: no column 'total'",
                        "error_json": {"diagnostics": [{"code": "query_execution_failed"}]},
                    }
                ]

        integration_app.run_manager = RemoteRunManager(_Client())

        result = call(integration_app, "check_runs", {})

        assert result["ok"] is False
        assert result["diagnostics"][0]["code"] == "query_execution_failed"
        assert "no column 'total'" in result["logs"]

    def test_it_starts_no_run(self, integration_app, runs):
        runs.create(dag_filter="+x+")
        runs.set_state(runs.list()[0]["id"], RunState.SUCCEEDED)
        before = len(runs.list())

        call(integration_app, "check_runs", {})

        assert len(runs.list()) == before


class TestWaitingForABuild:
    """Shared by `check_runs` and the screenshot tool, which must not disagree
    about whether the data is built yet."""

    def test_it_waits_while_a_run_is_in_flight(self, integration_app, runs, monkeypatch):
        from visivo.agent import runs as run_helpers

        states = [RunState.RUNNING.value, RunState.RUNNING.value, RunState.SUCCEEDED.value]
        monkeypatch.setattr(
            integration_app.run_manager, "list", lambda limit=1: [{"state": states.pop(0)}]
        )
        monkeypatch.setattr(run_helpers.time, "sleep", lambda _s: None)

        assert run_helpers.wait_for_runs(integration_app) is True
        assert states == []

    def test_a_run_that_never_finishes_does_not_block_forever(
        self, integration_app, runs, monkeypatch
    ):
        from visivo.agent import runs as run_helpers

        monkeypatch.setattr(
            integration_app.run_manager, "list", lambda limit=1: [{"state": RunState.RUNNING.value}]
        )
        monkeypatch.setattr(run_helpers.time, "sleep", lambda _s: None)

        assert run_helpers.wait_for_runs(integration_app, timeout=0.05) is False

    def test_a_server_with_no_run_manager_is_not_blocked(self, integration_app):
        """Minimal harnesses and any surface without runs still work."""
        from visivo.agent import runs as run_helpers

        integration_app.run_manager = None

        assert run_helpers.wait_for_runs(integration_app) is True
