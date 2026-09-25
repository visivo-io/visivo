"""Driving the loop from the viewer (VIS-1338).

The model here is a `FunctionModel` the test writes, so these exercise the real
session manager, the real background thread and the real cancellation path —
the only fake is the thing that would need a key.
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


def _settle(manager, session_id, until, timeout=10):
    """Poll like the viewer does, rather than sleeping a guessed interval."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        session = manager.get(session_id)
        if session and session.state in until:
            return session
        time.sleep(0.02)
    raise AssertionError(f"session stayed {manager.get(session_id).state}")


class TestStarting:
    def test_a_prompt_is_required(self, integration_client):
        assert integration_client.post("/api/agent/", json={"prompt": "  "}).status_code == 400

    def test_an_unconfigured_agent_is_a_400_with_instructions(
        self, integration_client, monkeypatch
    ):
        """Nothing is broken — the user has not set a key. A 500 would send
        them looking for a bug."""
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        monkeypatch.setattr("visivo.agent.model_config.read_profile", lambda *a, **k: {})

        response = integration_client.post("/api/agent/", json={"prompt": "hi"})

        assert response.status_code == 400
        assert response.get_json()["action"] == "configure_agent"
        assert "ANTHROPIC_API_KEY" in response.get_json()["error"]

    def test_only_one_at_a_time(self, integration_client, integration_app, sessions):
        """Two loops editing the same draft tier would interleave writes to the
        same objects with no way to tell whose was whose."""
        held = _blocking_model()
        start(integration_app, "first", held.model, session_manager=sessions)
        _settle(sessions, sessions.list()[0]["id"], (SessionState.RUNNING,))

        response = integration_client.post("/api/agent/", json={"prompt": "second"})

        assert response.status_code == 409
        assert response.get_json()["action"] == "agent_in_progress"
        held.release()


class TestPolling:
    def test_a_finished_session_reports_its_answer(
        self, integration_client, integration_app, sessions
    ):
        model = FunctionModel(lambda m, i: ModelResponse(parts=[TextPart("All done.")]))
        session = start(integration_app, "do it", model, session_manager=sessions)
        _settle(sessions, session.id, (SessionState.SUCCEEDED,))

        body = integration_client.get(f"/api/agent/{session.id}/").get_json()

        assert body["state"] == "succeeded"
        assert body["output"] == "All done."

    def test_a_failure_carries_its_reason(self, integration_client, integration_app, sessions):
        """An agent failure is a failure and surfaces like any other."""

        def explodes(messages, info: AgentInfo):
            raise RuntimeError("the provider said no")

        session = start(integration_app, "do it", FunctionModel(explodes), session_manager=sessions)
        _settle(sessions, session.id, (SessionState.FAILED,))

        body = integration_client.get(f"/api/agent/{session.id}/").get_json()

        assert body["state"] == "failed"
        assert "the provider said no" in body["error"]

    def test_an_unknown_session_is_a_404(self, integration_client):
        assert integration_client.get("/api/agent/nope/").status_code == 404


class TestStopping:
    def test_cancel_interrupts_a_model_call(self, integration_client, integration_app, sessions):
        """The wait someone presses Stop during is INSIDE a model call. A flag
        checked between turns would sit through the very call they are trying
        to escape, so this blocks in the model and cancels anyway."""
        held = _blocking_model()
        session = start(integration_app, "go", held.model, session_manager=sessions)
        _settle(sessions, session.id, (SessionState.RUNNING,))

        response = integration_client.post(f"/api/agent/{session.id}/cancel/")

        assert response.get_json()["cancelled"] is True
        assert _settle(sessions, session.id, (SessionState.CANCELLED,)).state == (
            SessionState.CANCELLED
        )
        held.release()

    def test_a_cancelled_loop_keeps_what_it_already_wrote(
        self, integration_client, integration_app, sessions
    ):
        """Drafts are the discardable unit. Rolling them back would decide for
        the user something they can decide themselves, in one click."""
        held = _blocking_model(
            first=ToolCallPart("write_markdown", {"config": {"name": "half_done", "content": "#"}})
        )
        session = start(integration_app, "go", held.model, session_manager=sessions)
        _settle(sessions, session.id, (SessionState.RUNNING,))
        while integration_app.markdown_manager.get("half_done") is None:
            time.sleep(0.02)

        integration_client.post(f"/api/agent/{session.id}/cancel/")
        _settle(sessions, session.id, (SessionState.CANCELLED,))

        assert integration_app.markdown_manager.get("half_done") is not None
        held.release()

    def test_stopping_a_finished_session_is_not_an_error(
        self, integration_client, integration_app, sessions
    ):
        """Pressing Stop as it ends is a race the user cannot see. The answer
        is its final state, not a failure."""
        model = FunctionModel(lambda m, i: ModelResponse(parts=[TextPart("done")]))
        session = start(integration_app, "go", model, session_manager=sessions)
        _settle(sessions, session.id, (SessionState.SUCCEEDED,))

        body = integration_client.post(f"/api/agent/{session.id}/cancel/").get_json()

        assert body["cancelled"] is False
        assert body["session"]["state"] == "succeeded"


class _Held:
    def __init__(self, model):
        self.model = model

    def release(self):
        """Nothing to release — the model is interrupted by cancellation, not
        by being let go. Kept so call sites read as a paired acquire/release."""


def _blocking_model(first=None):
    """A model that answers once (optionally with a tool call) and then waits.

    ASYNC on purpose. A sync function would block the event loop itself, and
    `call_soon_threadsafe` would never get a turn — the cancel would be queued
    behind the very wait it is meant to interrupt. A real provider call is
    async I/O over httpx, so this has to be too or the test proves nothing
    about the real thing. (It proved exactly that when written sync: cancel
    silently did nothing.)
    """
    import asyncio

    turns = {"n": 0}

    async def respond(messages, info: AgentInfo):
        turns["n"] += 1
        if turns["n"] == 1 and first is not None:
            return ModelResponse(parts=[first])
        await asyncio.sleep(30)
        return ModelResponse(parts=[TextPart("never reached")])

    return _Held(FunctionModel(respond))
