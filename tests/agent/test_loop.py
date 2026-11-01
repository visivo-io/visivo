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


class TestItDoesNotStopOnAPlan:
    """A reply without a tool call ends the turn, so a model that ends on "I will
    now create the charts" leaves half a dashboard (built-in eval, 2026-10-18)."""

    def test_a_plan_only_reply_goes_back_once_and_the_calls_follow(self, integration_app):
        nudges = []

        def promises(messages, info: AgentInfo):
            return ModelResponse(parts=[TextPart("I will now create the weekly charts.")])

        def acts(messages, info: AgentInfo):
            nudges.append(str(messages[-1]))
            return ModelResponse(parts=[ToolCallPart("list_sources", {})])

        agent = build_agent(integration_app, _model(promises, acts))
        assert agent.run_sync("build the exec dashboard").output == "Done."
        assert "described calls you have not made" in nudges[0]
        assert [a["tool"] for a in log().recent()] == ["list_sources"]

    def test_a_second_plan_is_accepted_rather_than_failing_the_turn(self, integration_app):
        def promises(messages, info: AgentInfo):
            return ModelResponse(parts=[TextPart("Next, I'll build the table.")])

        agent = build_agent(integration_app, _model(promises, promises))
        assert agent.run_sync("go").output == "Next, I'll build the table."

    def test_a_finished_reply_passes(self, integration_app):
        agent = build_agent(integration_app, _model())
        assert agent.run_sync("go").output == "Done."

    def test_the_pattern_reads_promises_not_reports(self):
        from visivo.agent.loop import PLAN_ONLY

        for text in (
            "I'll now write the insight.",
            "Let me create a model",
            "I am going to build it",
        ):
            assert PLAN_ONLY.search(text)
        for text in (
            "I created the dashboard.",
            "Write access is needed.",
            "I will need a source.",
        ):
            assert not PLAN_ONLY.search(text)


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


SALES_SQL = (
    "with recursive t as (select 0 as i union all select i + 1 from t where i < 119) "
    "select date('2024-01-01', '+' || i || ' days') as day, "
    "case i % 3 when 0 then 'North' when 1 then 'South' else 'East' end as region, "
    "(i * 7) % 23 + 1 as amount from t"
)


def _result_of(messages, tool):
    """The newest result the model was handed for ``tool``."""
    for message in reversed(messages):
        for part in reversed(message.parts):
            if type(part).__name__ == "ToolReturnPart" and part.tool_name == tool:
                return part.content
    raise AssertionError(f"no result for {tool}")


class TestTheWholePipeline:
    """VIS-1450: one scripted turn through every stage the skills teach, against
    the real registry. The regression guard for the pipeline: a renamed tool, a
    changed argument shape or a refusal anywhere in the chain fails here."""

    def _turns(self):
        def card(messages, column):
            cards = _result_of(messages, "profile_columns")["cards"]
            return {**next(c for c in cards if c["column"] == column), "model": "sales"}

        def family(messages):
            return _result_of(messages, "recommend_charts")["recommendations"][0]["family"]

        def rows(messages):
            return _result_of(messages, "recommend_layout")["dashboards"][0]["rows"]

        insight = {
            "name": "amount_by_day",
            "props": {
                "type": "scatter",
                "mode": "lines",
                "x": "?{ ${ref(sales).day} }",
                "y": "?{ sum(${ref(sales).amount}) }",
            },
            "interactions": [{"sort": "?{ ${ref(sales).day} ASC }"}],
        }
        return [
            _calls("read_skill", {"name": "explore-a-source"}),
            _calls("describe_source", {"name": "source"}),
            _calls("profile_columns", {"source": "source", "sql": SALES_SQL}),
            _calls(
                "write_model",
                {"config": {"name": "sales", "source": "${ref(source)}", "sql": SALES_SQL}},
            ),
            lambda m, i: ModelResponse(
                parts=[
                    ToolCallPart(
                        "score_candidates",
                        {"cards": [card(m, c) for c in ("day", "region", "amount")]},
                    )
                ]
            ),
            lambda m, i: ModelResponse(
                parts=[
                    ToolCallPart(
                        "recommend_charts",
                        {
                            "metrics": [{"name": "amount", "agg": "sum"}],
                            "dimensions": [card(m, "day")],
                            "intent": "trend",
                            "context": {"model": "sales"},
                        },
                    )
                ]
            ),
            lambda m, i: ModelResponse(
                parts=[ToolCallPart("read_skill", {"name": f"charts/{family(m)}"})]
            ),
            _calls("write_insight", {"config": insight}),
            _calls("preview_insight", {"name": "amount_by_day"}),
            lambda m, i: ModelResponse(
                parts=[
                    ToolCallPart(
                        "recommend_inputs",
                        {
                            "cards": [card(m, c) for c in ("day", "region")],
                            "insights": [
                                {"name": "amount_by_day", "model": "sales", "columns": ["day"]}
                            ],
                        },
                    )
                ]
            ),
            _calls(
                "write_chart",
                {"config": {"name": "amount_chart", "insights": ["${ref(amount_by_day)}"]}},
            ),
            _calls(
                "recommend_layout",
                {
                    "items": [{"name": "amount_chart", "kind": "chart", "family": "line"}],
                    "intent": "trend",
                },
            ),
            lambda m, i: ModelResponse(
                parts=[
                    ToolCallPart(
                        "write_dashboard", {"config": {"name": "pipeline", "rows": rows(m)}}
                    )
                ]
            ),
        ]

    def test_a_scripted_exploration_builds_a_valid_dashboard_within_budget(self, integration_app):
        from visivo.agent import skills
        from visivo.agent.loop import MAX_MODEL_REQUESTS, MAX_TOOL_CALLS

        agent = build_agent(integration_app, _model(*self._turns()))
        result = agent.run_sync("explore it and build a dashboard", usage_limits=usage_limits())

        returns = [
            (part.tool_name, part.content)
            for message in result.all_messages()
            for part in message.parts
            if type(part).__name__ == "ToolReturnPart"
        ]
        refused = [(name, c) for name, c in returns if isinstance(c, dict) and "error" in c]
        assert not refused, refused
        assert len(returns) == len(self._turns())
        assert _result_of(result.all_messages(), "preview_insight")["rows"]
        usage = result.usage
        assert usage.requests <= MAX_MODEL_REQUESTS and usage.tool_calls <= MAX_TOOL_CALLS
        assert len(skills.always_on_prompt().encode()) <= skills.MAX_ALWAYS_BYTES
        dashboard = integration_app.dashboard_manager.get("pipeline")
        assert dashboard is not None
        from visivo.agent.tools import call

        config = integration_app.dashboard_manager.get("pipeline").model_dump(
            mode="json", exclude_none=True
        )
        assert call(integration_app, "validate_dashboard", {"config": config})["valid"] is True


class TestWhatTheAgentIsToldAboutBuilds:
    """The agent reported success over a failed build, and the instructions are
    why: they said it could not run at all, while `write_*` starts a build
    whenever the run trigger is automatic.
    """

    def _always_on(self):
        from visivo.agent import skills

        return skills.always_on_prompt()

    def test_it_is_no_longer_told_it_cannot_run(self):
        assert "cannot commit, run" not in INSTRUCTIONS
        assert "cannot commit, run" not in self._always_on()

    def test_both_readers_are_told_to_check_the_build(self):
        """An MCP client reads the skills and never sees `INSTRUCTIONS`, so a
        rule in only one of them instructs only one of the two agents."""
        assert "check_runs" in INSTRUCTIONS
        assert "check_runs" in self._always_on()

    def test_both_readers_are_told_to_look_before_reporting_nothing(self):
        """It told a user to upload a CSV on a project that had a source,
        without calling `list_sources` once."""
        assert "list_sources" in INSTRUCTIONS
        assert "list_sources" in self._always_on()

    def test_the_always_on_set_still_fits_its_budget(self):
        from visivo.agent import skills

        assert len(self._always_on().encode()) <= skills.MAX_ALWAYS_BYTES

    def test_check_runs_is_a_tool_the_instructions_can_name(self):
        """Prose telling the agent to call something it has not been given is
        the one failure mode this cannot afford."""
        assert "check_runs" in TOOLS
