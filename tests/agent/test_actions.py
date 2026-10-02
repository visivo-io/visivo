"""Recording what an agent did (VIS-1364).

The property that carries the weight is *where* the recording happens. It wraps
`call()`, so every producer is captured by construction — an external client
over MCP and, later, the built-in loop both arrive there. A log that only
covered one of them would mean the registry was being bypassed, which is the
thing the Agent tab card warns about.
"""

import json

import pytest

from visivo.agent.actions import ActionLog, attributed_to, log
from visivo.agent.tools import ToolError, call


@pytest.fixture(autouse=True)
def empty_log():
    """The log is process-wide, like the draft tier it describes."""
    log().clear()
    yield
    log().clear()


class TestEveryCallIsRecorded:
    def test_a_success_lands(self, integration_app):
        call(
            integration_app,
            "write_markdown",
            {"config": {"name": "noted", "content": "# hi"}},
        )

        [action] = log().recent()
        assert action["tool"] == "write_markdown"
        assert action["outcome"] == "ok"

    def test_a_refusal_lands_too(self, integration_app):
        """ "What failed" is half the value of the log."""
        with pytest.raises(ToolError):
            call(integration_app, "get_source", {"name": "nope"})

        [action] = log().recent()
        assert action["outcome"] == "error"
        assert "nope" in action["error"]

    def test_a_refusal_is_still_raised(self, integration_app):
        """Recording happens on the way past; the transport still decides how
        to report it."""
        with pytest.raises(ToolError):
            call(integration_app, "get_source", {"name": "nope"})

    def test_an_unknown_tool_lands(self, integration_app):
        with pytest.raises(ToolError):
            call(integration_app, "fly", {})

        assert log().recent()[0]["outcome"] == "error"

    def test_a_failed_validation_reads_as_a_failure(self, integration_app):
        """`validate_*` answers rather than raising — the call worked, but the
        config did not, and the log should say the useful thing."""
        call(integration_app, "validate_markdown", {"config": {"name": "bad"}})

        assert log().recent()[0]["outcome"] == "error"

    def test_exactly_one_action_per_call(self, integration_app):
        call(integration_app, "list_sources", {})
        call(integration_app, "list_models", {})

        assert len(log().recent()) == 2


class TestAnEntryIsNavigable:
    """The tab addresses objects as `type:name`, so an entry has to carry both
    — derived from the tool's own name and arguments rather than declared."""

    def test_a_named_read_records_its_object(self, integration_app):
        source = integration_app.source_manager.get_all_objects_list()[0]

        call(integration_app, "get_source", {"name": source.name})

        assert log().recent()[0]["object"] == {"type": "source", "name": source.name}

    def test_a_write_takes_the_name_from_its_config(self, integration_app):
        call(
            integration_app,
            "write_markdown",
            {"config": {"name": "noted", "content": "# hi"}},
        )

        assert log().recent()[0]["object"] == {"type": "markdown", "name": "noted"}

    def test_a_tool_about_no_object_records_none(self, integration_app):
        call(integration_app, "get_schema", {"type": "model"})

        assert log().recent()[0]["object"] is None

    def test_a_failed_call_still_says_what_it_was_about(self, integration_app):
        """The entry you most want to click is the one that went wrong."""
        with pytest.raises(ToolError):
            call(integration_app, "get_source", {"name": "nope"})

        assert log().recent()[0]["object"] == {"type": "source", "name": "nope"}


class TestTheLogItself:
    def test_newest_first(self):
        entries = ActionLog()
        entries.record("first")
        entries.record("second")

        assert [a["tool"] for a in entries.recent()] == ["second", "first"]

    def test_it_is_a_window_not_an_archive(self):
        entries = ActionLog(limit=3)
        for index in range(10):
            entries.record(f"tool_{index}")

        recent = entries.recent()
        assert len(recent) == 3
        assert recent[0]["tool"] == "tool_9"

    def test_reading_it_cannot_change_it(self):
        """It is the one surface an agent's work is inspected from."""
        entries = ActionLog()
        entries.record("first")

        entries.recent().clear()

        assert len(entries.recent()) == 1

    def test_every_entry_is_serialisable(self, integration_app):
        """It goes out over HTTP; a value that cannot be encoded is a 500 on
        the one page meant to explain what happened."""
        call(integration_app, "list_sources", {})

        json.dumps(log().recent())


class TestTheEndpoint:
    def test_it_serves_the_log_newest_first(self, integration_app, integration_client):
        call(integration_app, "list_sources", {})
        call(integration_app, "list_models", {})

        response = integration_client.get("/api/agent/actions/")

        actions = json.loads(response.data)["actions"]
        assert [a["tool"] for a in actions] == ["list_models", "list_sources"]

    def test_it_is_bounded_however_much_is_asked_for(self, integration_app, integration_client):
        for _ in range(5):
            call(integration_app, "list_sources", {})

        response = integration_client.get("/api/agent/actions/?limit=2")

        assert len(json.loads(response.data)["actions"]) == 2

    def test_a_nonsense_limit_does_not_break_it(self, integration_client):
        response = integration_client.get("/api/agent/actions/?limit=banana")

        assert response.status_code == 200

    def test_reading_it_records_nothing(self, integration_app, integration_client):
        """Otherwise the log is a record of itself being read."""
        call(integration_app, "list_sources", {})

        integration_client.get("/api/agent/actions/")

        assert len(log().recent()) == 1


class TestTheEndpointDoesNotKnowItRecords:
    """The structural claim: MCP records because it goes through `call()`, not
    because the view remembers to."""

    def test_an_mcp_call_is_recorded(self, integration_client):
        integration_client.post(
            "/api/mcp/",
            json={
                "jsonrpc": "2.0",
                "id": 1,
                "method": "tools/call",
                "params": {"name": "list_sources", "arguments": {}},
            },
        )

        assert [a["tool"] for a in log().recent()] == ["list_sources"]

    def test_the_view_contains_no_recording_of_its_own(self):
        """If it did, the built-in loop would need its own copy — and the two
        would drift."""
        from pathlib import Path

        source = Path("visivo/server/views/mcp_views.py").read_text()

        assert ".record(" not in source


class TestListenersSeeRecordings:
    """The push half (VIS-1337). ``record`` is where every producer already
    converges, so a listener there needs no second wiring per producer."""

    def test_a_listener_is_called_with_the_action(self):
        log_ = ActionLog()
        seen = []
        log_.on_record(seen.append)

        log_.record("write_model", obj={"type": "model", "name": "orders"})

        assert [a["tool"] for a in seen] == ["write_model"]
        assert seen[0]["object"] == {"type": "model", "name": "orders"}

    def test_a_failing_listener_does_not_lose_the_action(self):
        """The action really happened. A transport that cannot carry it is the
        transport's problem, and the log is still readable."""
        log_ = ActionLog()

        def broken(action):
            raise RuntimeError("socket is gone")

        log_.on_record(broken)
        delivered = []
        log_.on_record(delivered.append)

        log_.record("write_model")

        assert [a["tool"] for a in log_.recent()] == ["write_model"]
        assert len(delivered) == 1

    def test_the_call_path_notifies(self, integration_app):
        """Not ``record`` directly — the point is that a tool call reaches a
        listener without the tool knowing one exists."""
        pushed = []
        log().on_record(pushed.append)

        call(
            integration_app,
            "write_markdown",
            {"config": {"name": "pushed", "content": "# pushed"}},
        )

        assert [a["tool"] for a in pushed] == ["write_markdown"]

    def test_the_module_knows_nothing_of_a_socket(self):
        """The seam exists so the recording layer stays importable without
        Flask — a built-in loop records the same way with no server running."""
        from pathlib import Path

        source = Path("visivo/agent/actions.py").read_text()

        assert "socketio" not in source
        assert "flask" not in source.lower()


class TestOneTurnsActions:
    """Which of the log's entries belong to the turn that is being reported.

    The log is process-wide on purpose — an MCP client and the built-in loop
    write to the same one, because they share the registry. That is what makes
    "what did THIS turn do" a question rather than just reading the log.
    """

    def test_a_marker_and_a_slice_give_one_turns_work(self):
        log = ActionLog()
        log.record("write_model", obj={"type": "model", "name": "before"})

        mark = log.marker()
        log.record("write_chart", obj={"type": "chart", "name": "during"})
        log.record("write_table", obj={"type": "table", "name": "during_too"})

        assert [a["tool"] for a in log.since(mark)] == ["write_chart", "write_table"]

    def test_an_empty_log_has_a_marker_that_admits_everything(self):
        log = ActionLog()
        mark = log.marker()
        log.record("write_model", obj={"type": "model", "name": "first"})

        assert [a["tool"] for a in log.since(mark)] == ["write_model"]

    def test_a_turn_that_did_nothing_reports_nothing(self):
        log = ActionLog()
        log.record("write_model", obj={"type": "model", "name": "earlier"})

        assert log.since(log.marker()) == []

    def test_another_producers_work_is_not_claimed_as_ours(self):
        """An MCP client writing between our two calls is not part of our turn
        — but it IS between them, so a slice by position would swallow it.
        Ids are per-action, which is why this is by id."""
        log = ActionLog()
        mark = log.marker()
        ours = log.record("write_model", obj={"type": "model", "name": "ours"})
        theirs = log.record("write_chart", obj={"type": "chart", "name": "theirs"})

        assert [a["id"] for a in log.since(mark)] == [ours["id"], theirs["id"]]
        assert [a["id"] for a in log.since(ours["id"])] == [theirs["id"]]

    def test_the_slice_is_oldest_first(self):
        """The opposite order to `recent`, and deliberately: a log is read
        newest first, a turn's work is read in the order it happened."""
        log = ActionLog()
        mark = log.marker()
        log.record("write_model", obj={"type": "model", "name": "one"})
        log.record("write_chart", obj={"type": "chart", "name": "two"})

        assert [a["tool"] for a in log.since(mark)] == ["write_model", "write_chart"]
        assert [a["tool"] for a in log.recent()] == ["write_chart", "write_model"]

    def test_a_marker_survives_entries_falling_off_the_end(self):
        """The log is capped. A marker is an id, not an index, so it still
        means the same moment after the cap has discarded what it named."""
        log = ActionLog(limit=3)
        mark = log.marker()
        for i in range(5):
            log.record("write_model", obj={"type": "model", "name": f"m{i}"})

        # Only what survived, but nothing older than the marker and nothing
        # mistakenly excluded.
        assert [a["object"]["name"] for a in log.since(mark)] == ["m2", "m3", "m4"]


class TestWhoMadeTheCall:
    """The tab shows the built-in loop's calls with the turn that made them and
    gathers an external client's under their own heading, so a recording has to
    say which it was."""

    def test_an_unattributed_call_says_nothing_about_its_source(self):
        action = ActionLog().record("write_model")

        assert action["source"] is None
        assert action["session_id"] is None

    def test_an_mcp_call_says_so(self):
        log = ActionLog()
        with attributed_to("mcp"):
            action = log.record("write_model")

        assert action["source"] == "mcp"

    def test_an_agent_call_carries_its_session(self):
        log = ActionLog()
        with attributed_to("agent", "s1"):
            action = log.record("write_model")

        assert (action["source"], action["session_id"]) == ("agent", "s1")

    def test_attribution_ends_with_its_block(self):
        log = ActionLog()
        with attributed_to("mcp"):
            pass

        assert log.record("write_model")["source"] is None

    def test_a_turns_slice_leaves_out_other_callers(self):
        log = ActionLog()
        mark = log.marker()
        with attributed_to("agent", "s1"):
            ours = log.record("write_model")
        with attributed_to("mcp"):
            log.record("write_chart")
        with attributed_to("agent", "s2"):
            log.record("write_table")

        assert [a["id"] for a in log.since(mark, session_id="s1")] == [ours["id"]]
