"""A session is a conversation, not a request (VIS-1338).

Without history every prompt starts from nothing and the agent is a one-shot
tool wearing a chat box — "now add a chart to that" has no referent. These
tests are about what the model is HANDED on the second turn, which is the only
thing that makes the second turn mean anything.
"""

import time

import pytest
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from visivo.agent.runner import start
from visivo.agent.sessions import SessionManager, SessionState


@pytest.fixture(autouse=True)
def sessions():
    manager = SessionManager.instance()
    manager._init()
    yield manager
    manager._init()


def _settle(manager, session_id, timeout=10):
    deadline = time.time() + timeout
    while time.time() < deadline:
        session = manager.get(session_id)
        if session and session.state not in (SessionState.QUEUED, SessionState.RUNNING):
            return session
        time.sleep(0.02)
    raise AssertionError("session never finished")


def _answers(*texts):
    """A model that answers each turn with the next text, recording what it was
    given so a test can assert on the history it saw."""
    seen = []

    def respond(messages, info: AgentInfo):
        seen.append(messages)
        index = min(len(seen) - 1, len(texts) - 1)
        return ModelResponse(parts=[TextPart(texts[index])])

    model = FunctionModel(respond)
    model.seen = seen
    return model


class TestASecondTurnSeesTheFirst:
    def test_the_model_is_given_the_earlier_exchange(self, integration_app, sessions):
        model = _answers("A model named orders.", "And a chart of it.")
        first = start(integration_app, "make a model", model, session_manager=sessions)
        _settle(sessions, first.id)

        start(integration_app, "now chart it", model, session_manager=sessions, session_id=first.id)
        _settle(sessions, first.id)

        second_turn = str(model.seen[1])
        assert "make a model" in second_turn
        assert "A model named orders." in second_turn

    def test_a_new_conversation_starts_clean(self, integration_app, sessions):
        """Otherwise one person's session leaks into the next."""
        model = _answers("first", "second")
        first = start(integration_app, "remember this", model, session_manager=sessions)
        _settle(sessions, first.id)

        second = start(integration_app, "fresh", model, session_manager=sessions)
        _settle(sessions, second.id)

        assert second.id != first.id
        assert "remember this" not in str(model.seen[1])

    def test_tool_calls_are_replayed_not_summarised(self, integration_app, sessions):
        """pydantic-ai needs its own message objects back. Re-deriving history
        from our readable transcript would drop the tool results and the model
        would redo work it had already done."""
        turns = {"n": 0}

        def respond(messages, info: AgentInfo):
            turns["n"] += 1
            if turns["n"] == 1:
                return ModelResponse(
                    parts=[
                        ToolCallPart("write_markdown", {"config": {"name": "m", "content": "#"}})
                    ]
                )
            if turns["n"] == 2:
                return ModelResponse(parts=[TextPart("Made it.")])
            return ModelResponse(parts=[TextPart("Still there.")])

        model = FunctionModel(respond)
        first = start(integration_app, "make it", model, session_manager=sessions)
        _settle(sessions, first.id)

        history = sessions.get(first.id).history
        assert any("write_markdown" in str(message) for message in history)


class TestTheTranscript:
    def test_it_reads_as_a_conversation(self, integration_app, sessions):
        model = _answers("Done that.", "And that.")
        first = start(integration_app, "do a thing", model, session_manager=sessions)
        _settle(sessions, first.id)
        start(integration_app, "another", model, session_manager=sessions, session_id=first.id)
        _settle(sessions, first.id)

        transcript = sessions.get(first.id).to_dict()["transcript"]

        assert [entry["role"] for entry in transcript] == ["user", "agent", "user", "agent"]
        assert [entry["text"] for entry in transcript] == [
            "do a thing",
            "Done that.",
            "another",
            "And that.",
        ]

    def test_listing_conversations_omits_their_messages(self, integration_app, sessions):
        """A list of conversations is not a place to send every message of
        every one of them."""
        model = _answers("ok")
        session = start(integration_app, "hello", model, session_manager=sessions)
        _settle(sessions, session.id)

        [listed] = sessions.list()

        assert "transcript" not in listed
        assert listed["turns"] == 2

    def test_a_failed_turn_leaves_the_conversation_usable(self, integration_app, sessions):
        """One bad turn must not end the conversation — the next prompt still
        has everything before it."""

        def explodes_once(messages, info: AgentInfo):
            if len(messages) <= 2:
                raise RuntimeError("provider blew up")
            return ModelResponse(parts=[TextPart("Recovered.")])

        session = start(
            integration_app, "first", FunctionModel(explodes_once), session_manager=sessions
        )
        _settle(sessions, session.id)
        assert sessions.get(session.id).state == SessionState.FAILED

        start(
            integration_app,
            "second",
            _answers("Recovered."),
            session_manager=sessions,
            session_id=session.id,
        )
        settled = _settle(sessions, session.id)

        assert settled.state == SessionState.SUCCEEDED
        assert settled.error is None


class TestContinuingSomethingGone:
    def test_an_unknown_session_is_refused_not_silently_restarted(self, integration_app, sessions):
        """The user believes they are still in a conversation. Quietly giving
        them a new one loses everything it was about."""
        result = start(
            integration_app,
            "carry on",
            _answers("ok"),
            session_manager=sessions,
            session_id="no-such-session",
        )

        assert result is None
        assert sessions.list() == []

    def test_the_endpoint_says_so(self, integration_client, sessions):
        response = integration_client.post(
            "/api/agent/", json={"prompt": "carry on", "session_id": "gone"}
        )

        assert response.status_code == 404
        assert response.get_json()["action"] == "agent_session_gone"

    def test_it_says_so_even_with_no_model_configured(
        self, integration_client, sessions, monkeypatch
    ):
        """Whether the session exists is a fact about the REQUEST; whether a
        key is configured is a fact about the deployment. Resolving the model
        first made the answer depend on whether the caller happened to have a
        key — which is how the test above passed locally and 400'd in CI."""
        for name in ("ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY"):
            monkeypatch.delenv(name, raising=False)
        monkeypatch.setattr("visivo.agent.model_config.read_profile", lambda *a, **k: {})
        monkeypatch.setattr("visivo.agent.cloud_model.available", lambda host=None: False)

        response = integration_client.post(
            "/api/agent/", json={"prompt": "carry on", "session_id": "gone"}
        )

        assert response.status_code == 404
        assert response.get_json()["action"] == "agent_session_gone"


class TestReportingWhichServerFailed:
    """ "Not sure what host it is trying" — a 404 that does not say where it
    was pointed is unactionable, and `agent: host:` can point anywhere."""

    def test_a_failure_before_the_model_is_built_still_reports(
        self, integration_app, sessions, monkeypatch
    ):
        """The endpoint is read BEFORE the try. Reading it inside would mean an
        early exception raises NameError in the handler and replaces the real
        failure with a bug in the reporting of it."""
        from visivo.agent import runner

        monkeypatch.setattr(
            runner, "build_agent", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("early"))
        )

        session = start(integration_app, "go", _answers("never"), session_manager=sessions)
        settled = _settle(sessions, session.id)

        assert settled.state == SessionState.FAILED
        assert "early" in settled.error


class TestATurnCarriesItsWork:
    """The answer and the work that produced it, read together.

    Without this the transcript says the agent replied and the activity log
    says something happened, and nothing on screen joins them — which is what
    "it responded but showed no tool calls" looks like from the outside.
    """

    def test_an_agent_turn_holds_the_actions_it_made(self):
        manager = SessionManager()
        manager._init()
        session = manager.create("build me something")

        manager.remember(
            session.id,
            [],
            "built it",
            actions=[{"id": 1, "tool": "write_model"}, {"id": 2, "tool": "write_chart"}],
        )

        agent_entry = session.transcript[-1]
        assert agent_entry["role"] == "agent"
        assert [a["tool"] for a in agent_entry["actions"]] == ["write_model", "write_chart"]

    def test_the_prompt_carries_none(self):
        """A person asking for something did not call a tool. The key is still
        there so the reader never has to check whether it exists."""
        manager = SessionManager()
        manager._init()
        session = manager.create("build me something")

        assert session.transcript[0]["actions"] == []

    def test_a_turn_that_called_nothing_says_so_rather_than_omitting_it(self):
        manager = SessionManager()
        manager._init()
        session = manager.create("what models do I have?")

        manager.remember(session.id, [], "you have three", actions=[])

        assert session.transcript[-1]["actions"] == []

    def test_each_turn_holds_only_its_own(self):
        manager = SessionManager()
        manager._init()
        session = manager.create("first")
        manager.remember(session.id, [], "did the first", actions=[{"tool": "write_model"}])

        manager.add_turn(session.id, "second")
        manager.remember(session.id, [], "did the second", actions=[{"tool": "write_chart"}])

        agent_turns = [e for e in session.transcript if e["role"] == "agent"]
        assert [[a["tool"] for a in t["actions"]] for t in agent_turns] == [
            ["write_model"],
            ["write_chart"],
        ]


class TestTheWorkReachesTheTranscript:
    """End to end through the real loop, not just ``remember``.

    The scoping lives in ``runner._execute`` — take a marker, run the turn,
    slice. A unit test of the session cannot tell whether anything ever passes
    it real actions, which is the failure that was on screen.
    """

    def _writes_then_answers(self):
        turns = {"n": 0}

        def respond(messages, info: AgentInfo):
            turns["n"] += 1
            if turns["n"] == 1:
                return ModelResponse(
                    parts=[
                        ToolCallPart(
                            "write_markdown",
                            {"config": {"name": "from_the_turn", "content": "# hi"}},
                        )
                    ]
                )
            return ModelResponse(parts=[TextPart("Made it.")])

        return FunctionModel(respond)

    def test_the_answer_carries_the_tool_call_that_produced_it(self, integration_app, sessions):
        session = start(
            integration_app, "make it", self._writes_then_answers(), session_manager=sessions
        )
        _settle(sessions, session.id)

        answer = sessions.get(session.id).to_dict()["transcript"][-1]
        assert answer["role"] == "agent"
        assert [a["tool"] for a in answer["actions"]] == ["write_markdown"]
        assert answer["actions"][0]["object"]["name"] == "from_the_turn"

    def test_a_second_turn_does_not_re_report_the_firsts_work(self, integration_app, sessions):
        """The log is process-wide and not cleared between turns, so a slice
        taken from the wrong place shows the first turn's work again on the
        second — which reads as the agent redoing it."""
        session = start(
            integration_app, "make it", self._writes_then_answers(), session_manager=sessions
        )
        _settle(sessions, session.id)

        start(
            integration_app,
            "anything else",
            _answers("Nothing to do."),
            session_manager=sessions,
            session_id=session.id,
        )
        _settle(sessions, session.id)

        agent_turns = [e for e in sessions.get(session.id).transcript if e["role"] == "agent"]
        assert [len(t["actions"]) for t in agent_turns] == [1, 0]
