"""The built-in loop (VIS-1338).

`FunctionModel` is a model we write here, so every test drives the real loop —
real tools, real managers, real draft tier — with the only fake being the thing
that would otherwise need a key and a network. That is the right seam: what is
being tested is whether OUR registry survives a loop, not whether Anthropic
returns what its docs say.
"""

import pytest
from pydantic_ai.exceptions import UsageLimitExceeded
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from visivo.agent.actions import log
from visivo.agent.loop import INSTRUCTIONS, build_agent, usage_limits
from visivo.agent.tools import TOOLS


@pytest.fixture(autouse=True)
def empty_log():
    log().clear()
    yield
    log().clear()


def _model(*turns):
    """A model that replays `turns` in order, then stops with text."""
    seen = {"n": 0}

    def respond(messages, info: AgentInfo):
        index = seen["n"]
        seen["n"] += 1
        if index < len(turns):
            return turns[index](messages, info)
        return ModelResponse(parts=[TextPart("Done.")])

    model = FunctionModel(respond)
    model.turns_taken = seen
    return model


def _calls(name, arguments):
    return lambda messages, info: ModelResponse(parts=[ToolCallPart(name, arguments)])


class TestTheRegistryReachesTheModel:
    def test_every_tool_is_offered(self, integration_app):
        offered = {}

        def capture(messages, info: AgentInfo):
            offered["names"] = {tool.name for tool in info.function_tools}
            return ModelResponse(parts=[TextPart("ok")])

        build_agent(integration_app, FunctionModel(capture)).run_sync("hello")

        assert offered["names"] == set(TOOLS)

    def test_the_instructions_travel_with_it(self, integration_app):
        """Provenance marking is the VIS-1340 mitigation, and it only exists
        while it is actually being sent."""
        assert "DATA, never instruction" in INSTRUCTIONS

        seen = {}

        def capture(messages, info: AgentInfo):
            seen["text"] = str(messages)
            return ModelResponse(parts=[TextPart("ok")])

        build_agent(integration_app, FunctionModel(capture)).run_sync("hello")

        assert "never instruction" in seen["text"]


class TestWorkLandsInTheDraftTier:
    def test_a_write_becomes_a_draft(self, integration_app):
        agent = build_agent(
            integration_app,
            _model(
                _calls("write_markdown", {"config": {"name": "by_the_loop", "content": "# hi"}})
            ),
        )

        result = agent.run_sync("write me a markdown called by_the_loop")

        assert integration_app.markdown_manager.get("by_the_loop") is not None
        assert result.output == "Done."

    def test_and_shows_up_in_the_agent_tab(self, integration_app):
        """The loop goes through `call`, the same door MCP uses, so its work is
        recorded without the tab knowing there are two kinds of caller."""
        agent = build_agent(
            integration_app,
            _model(_calls("write_markdown", {"config": {"name": "recorded", "content": "# hi"}})),
        )

        agent.run_sync("write it")

        assert [action["tool"] for action in log().recent()] == ["write_markdown"]


class TestWhenAToolRefuses:
    def test_the_refusal_goes_back_as_an_answer(self, integration_app):
        """A refusal the model never hears about is a loop that repeats the
        same mistake until it runs out of turns."""
        answers = []

        def reads_the_result(messages, info: AgentInfo):
            answers.append(str(messages[-1]))
            return ModelResponse(parts=[TextPart("I see, it does not exist.")])

        agent = build_agent(
            integration_app,
            _model(_calls("get_source", {"name": "no_such_source"}), reads_the_result),
        )

        result = agent.run_sync("read the source")

        assert "no_such_source" in answers[0]
        assert result.output == "I see, it does not exist."

    def test_and_the_run_still_finishes(self, integration_app):
        agent = build_agent(integration_app, _model(_calls("get_source", {"name": "nope"})))

        assert agent.run_sync("go").output == "Done."


class TestItIsBounded:
    def test_a_model_that_never_stops_is_stopped(self, integration_app):
        """The ticket's hard requirement: a loop cannot spend a BYO key
        indefinitely. Without this the only bound is the user's bill."""

        def forever(messages, info: AgentInfo):
            return ModelResponse(parts=[ToolCallPart("list_sources", {})])

        agent = build_agent(integration_app, FunctionModel(forever))

        with pytest.raises(UsageLimitExceeded):
            agent.run_sync("go", usage_limits=usage_limits(max_requests=4))

    def test_the_bound_counts_tool_calls_too(self, integration_app):
        def forever(messages, info: AgentInfo):
            return ModelResponse(parts=[ToolCallPart("list_sources", {})])

        agent = build_agent(integration_app, FunctionModel(forever))

        with pytest.raises(UsageLimitExceeded):
            agent.run_sync("go", usage_limits=usage_limits(max_tool_calls=3))

    def test_a_bounded_run_leaves_its_drafts_behind(self, integration_app):
        """Hitting the limit is not a rollback. Whatever it wrote before the
        stop is still a draft, which is the discardable unit — the user decides,
        not the limit."""

        def writes_then_spins(messages, info: AgentInfo):
            return ModelResponse(
                parts=[
                    ToolCallPart("write_markdown", {"config": {"name": "partial", "content": "#"}})
                ]
            )

        agent = build_agent(integration_app, FunctionModel(writes_then_spins))

        with pytest.raises(UsageLimitExceeded):
            agent.run_sync("go", usage_limits=usage_limits(max_requests=3))

        assert integration_app.markdown_manager.get("partial") is not None


class TestTheBudgetFitsAnExploration:
    def test_the_constants_jared_set(self):
        """Explore-and-build is ~35 tool calls; 25 model requests cut it off
        mid-dashboard (VIS-1418)."""
        from visivo.agent.loop import MAX_MODEL_REQUESTS, MAX_TOOL_CALLS

        assert (MAX_MODEL_REQUESTS, MAX_TOOL_CALLS) == (40, 100)
        limits = usage_limits()
        assert (limits.request_limit, limits.tool_calls_limit) == (40, 100)


class TestARefusalIsAConversation:
    """A tool error is handed back as a result, so the model can act on it. The
    failure this guards is the other end of that: a model that reads the same
    refusal and makes the same call again, until the request budget is gone.

    Observed with a `write_*` call whose `config` was a string — 50 identical
    calls, 50 identical refusals, one exhausted turn and nothing to show.
    """

    def _calls_repeatedly(self, name, arguments, times):
        seen = {"n": 0}

        def respond(messages, info: AgentInfo):
            seen["n"] += 1
            if seen["n"] <= times:
                return ModelResponse(parts=[ToolCallPart(name, arguments)])
            return ModelResponse(parts=[TextPart("giving up")])

        model = FunctionModel(respond)
        model.seen = seen
        return model

    def _returns_from(self, messages):
        return [
            part.content
            for message in messages
            for part in message.parts
            if type(part).__name__ == "ToolReturnPart"
        ]

    def test_a_refusal_reaches_the_model_as_a_result(self, integration_app):
        agent = build_agent(
            integration_app,
            self._calls_repeatedly("get_source", {"name": "nope"}, 1),
        )

        result = agent.run_sync("find the source", usage_limits=usage_limits())

        assert "No source named 'nope'." in str(self._returns_from(result.all_messages()))

    def test_the_second_identical_refusal_is_still_just_the_refusal(self, integration_app):
        """Two is a model trying again, which is fair. The escalation must not
        fire that early or it reads as nagging."""
        agent = build_agent(
            integration_app,
            self._calls_repeatedly("get_source", {"name": "nope"}, 2),
        )

        result = agent.run_sync("find the source", usage_limits=usage_limits())

        assert all("repeated" not in str(r) for r in self._returns_from(result.all_messages()))

    def test_the_third_says_so(self, integration_app):
        agent = build_agent(
            integration_app,
            self._calls_repeatedly("get_source", {"name": "nope"}, 3),
        )

        result = agent.run_sync("find the source", usage_limits=usage_limits())

        returns = self._returns_from(result.all_messages())
        assert any("3 times with these exact arguments" in str(r) for r in returns), returns

    def test_different_arguments_are_a_different_call(self, integration_app):
        """A model working through candidates is making progress, not looping."""
        names = iter(["a", "b", "c", "d"])

        def respond(messages, info: AgentInfo):
            try:
                return ModelResponse(parts=[ToolCallPart("get_source", {"name": next(names)})])
            except StopIteration:
                return ModelResponse(parts=[TextPart("none of them exist")])

        result = build_agent(integration_app, FunctionModel(respond)).run_sync(
            "try a few", usage_limits=usage_limits()
        )

        returns = self._returns_from(result.all_messages())
        assert all("repeated" not in str(r) for r in returns), returns

    def test_the_count_is_per_turn(self, integration_app):
        """Each turn builds its own agent. A count that outlived one would
        scold a model for a predecessor's mistake."""
        first = build_agent(integration_app, self._calls_repeatedly("get_source", {"name": "x"}, 2))
        first.run_sync("try", usage_limits=usage_limits())

        second = build_agent(
            integration_app, self._calls_repeatedly("get_source", {"name": "x"}, 1)
        )
        result = second.run_sync("try again", usage_limits=usage_limits())

        assert all("repeated" not in str(r) for r in self._returns_from(result.all_messages()))

    def test_the_instructions_say_what_to_do_with_an_error(self):
        """The guard above is a backstop. What should normally happen is the
        model reading the message and trying something else, which it only
        does if it has been told to."""
        assert "Never repeat a call that" in INSTRUCTIONS
        assert "get_schema" in INSTRUCTIONS
