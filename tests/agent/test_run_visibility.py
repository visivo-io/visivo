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
