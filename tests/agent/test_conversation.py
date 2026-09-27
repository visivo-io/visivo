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
