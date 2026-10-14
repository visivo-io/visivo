"""Recovering from a bad turn.

The behaviour under test is the arithmetic that made this worth fixing: a turn
is 40 model requests, and one transient refusal on request 30 used to discard
the 29 before it. So these tests are mostly about what SURVIVES — the tool
results already collected, the budget already spent, the conversation a
follow-up needs — rather than about the retry itself.
"""

import asyncio

import pytest
from pydantic_ai.exceptions import (
    IncompleteToolCall,
    ModelHTTPError,
    UnexpectedModelBehavior,
    UsageLimitExceeded,
)
from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from visivo.agent.loop import build_agent
from visivo.agent.resilience import MAX_ATTEMPTS, TurnFailed, is_transient, run_turn


def _overloaded():
    return ModelHTTPError(status_code=529, model_name="m", body={"error": "overloaded"})


def _spend_limit():
    return ModelHTTPError(
        status_code=429,
        model_name="m",
        body={
            "error": "This account has used its $30 of free credit.",
            "action": "inference_limit_reached",
        },
    )


def _scripted(*turns):
    """A model that replays `turns`, where a turn may raise."""
    seen = {"n": 0}

    def respond(messages, info: AgentInfo):
        index = seen["n"]
        seen["n"] += 1
        if index < len(turns):
            outcome = turns[index]
            if isinstance(outcome, Exception):
                raise outcome
            return outcome
        return ModelResponse(parts=[TextPart("Done.")])

    model = FunctionModel(respond)
    model.seen = seen
    return model


def _no_waiting():
    """Backoff as a counter. The point of the test is what happens after the
    wait, and a real one would make the suite take a minute per case."""
    waits = []

    async def sleep(seconds):
        waits.append(seconds)

    return sleep, waits


class TestWhatCountsAsTransient:
    def test_a_rate_limit_is(self):
        assert is_transient(ModelHTTPError(status_code=429, model_name="m", body={}))

    def test_an_overloaded_provider_is(self):
        assert is_transient(_overloaded())

    def test_a_truncated_tool_call_is(self):
        assert is_transient(IncompleteToolCall("cut off mid-argument"))

    def test_a_connection_failure_is(self):
        import httpx

        assert is_transient(httpx.ConnectError("no route to host"))

    def test_a_spend_limit_is_not(self):
        """The one 429 that waiting cannot clear, and core has already phrased
        it. Retrying spends three more minutes to print the same sentence."""
        assert not is_transient(_spend_limit())

    def test_a_missing_inference_route_is_not(self):
        assert not is_transient(ModelHTTPError(status_code=404, model_name="m", body={}))

    def test_a_bad_key_is_not(self):
        assert not is_transient(ModelHTTPError(status_code=401, model_name="m", body={}))

    def test_a_model_that_will_not_behave_is_not(self):
        assert not is_transient(UnexpectedModelBehavior("exceeded max retries"))

    def test_a_bug_in_our_own_code_is_not(self):
        assert not is_transient(TypeError("NoneType is not subscriptable"))


class TestResumingRatherThanRestarting:
    def test_a_transient_failure_does_not_end_the_turn(self, integration_app):
        sleep, waits = _no_waiting()
        model = _scripted(
            ModelResponse(parts=[ToolCallPart("list_sources", {})]),
            _overloaded(),
            ModelResponse(parts=[TextPart("there are no sources")]),
        )

        result = asyncio.run(
            run_turn(build_agent(integration_app, model), "what sources exist?", sleep=sleep)
        )

        assert str(result.output) == "there are no sources"
        assert waits == [2]

    def test_the_work_already_done_is_not_repeated(self, integration_app):
        """The reason to resume rather than restart. The tool result from
        before the failure is in front of the model afterwards, so it does not
        call the tool again — which for a query tool is a bill, not a detail."""
        sleep, _ = _no_waiting()
        calls = {"n": 0}

        def respond(messages, info: AgentInfo):
            calls["n"] += 1
            if calls["n"] == 1:
                return ModelResponse(parts=[ToolCallPart("list_sources", {})])
            if calls["n"] == 2:
                raise _overloaded()
            # Whatever the model sees on resumption, it must include the
            # earlier call AND its result.
            kinds = [type(part).__name__ for message in messages for part in message.parts]
            assert "ToolCallPart" in kinds, kinds
            assert "ToolReturnPart" in kinds, kinds
            return ModelResponse(parts=[TextPart("read it already")])

        result = asyncio.run(
            run_turn(build_agent(integration_app, FunctionModel(respond)), "go", sleep=sleep)
        )

        assert str(result.output) == "read it already"

    def test_the_prompt_is_not_sent_twice(self, integration_app):
        """A resumption that re-sent the prompt would read to the model as the
        user having repeated themselves."""
        sleep, _ = _no_waiting()
        calls = {"n": 0}
        prompts_seen = []

        def respond(messages, info: AgentInfo):
            calls["n"] += 1
            prompts_seen.append(
                sum(
                    1
                    for message in messages
                    for part in message.parts
                    if type(part).__name__ == "UserPromptPart"
                )
            )
            if calls["n"] == 1:
                raise _overloaded()
            return ModelResponse(parts=[TextPart("ok")])

        asyncio.run(
            run_turn(build_agent(integration_app, FunctionModel(respond)), "one ask", sleep=sleep)
        )

        assert prompts_seen == [1, 1], prompts_seen

    def test_it_gives_up_after_the_last_attempt(self, integration_app):
        sleep, waits = _no_waiting()
        model = _scripted(*([_overloaded()] * (MAX_ATTEMPTS + 2)))

        with pytest.raises(TurnFailed):
            asyncio.run(run_turn(build_agent(integration_app, model), "go", sleep=sleep))

        assert model.seen["n"] == MAX_ATTEMPTS
        assert len(waits) == MAX_ATTEMPTS - 1

    def test_a_final_failure_still_carries_the_conversation(self, integration_app):
        """What makes "try again" a continuation instead of a restart."""
        sleep, _ = _no_waiting()
        model = _scripted(
            ModelResponse(parts=[ToolCallPart("list_sources", {})]),
            *([_overloaded()] * MAX_ATTEMPTS),
        )

        with pytest.raises(TurnFailed) as caught:
            asyncio.run(run_turn(build_agent(integration_app, model), "go", sleep=sleep))

        kinds = [type(part).__name__ for m in caught.value.messages for part in m.parts]
        assert "ToolReturnPart" in kinds, kinds

    def test_a_permanent_failure_is_not_retried(self, integration_app):
        sleep, waits = _no_waiting()
        model = _scripted(_spend_limit())

        with pytest.raises(TurnFailed) as caught:
            asyncio.run(run_turn(build_agent(integration_app, model), "go", sleep=sleep))

        assert model.seen["n"] == 1
        assert waits == []
        # Unwrapped by the caller, so the message the user reads is still
        # core's own sentence about the limit rather than ours about retries.
        assert isinstance(caught.value.error, ModelHTTPError)


class TestTheBudgetIsTheTurnsNotTheAttempts:
    def test_resumption_does_not_reset_the_request_limit(self, integration_app):
        """Otherwise a cap of 40 becomes a cap of 160, at exactly the moment
        things are going wrong and someone is paying per request.

        The model here never stops calling tools, and refuses once partway
        through. Counted across the whole turn, it must still get no more
        requests than the turn was given.
        """
        sleep, _ = _no_waiting()
        budget = 6
        answered = {"n": 0}

        def respond(messages, info: AgentInfo):
            answered["n"] += 1
            if answered["n"] == 3:
                raise _overloaded()
            return ModelResponse(parts=[ToolCallPart("list_sources", {})])

        with pytest.raises(TurnFailed) as caught:
            asyncio.run(
                run_turn(
                    build_agent(integration_app, FunctionModel(respond)),
                    "go",
                    max_requests=budget,
                    sleep=sleep,
                )
            )

        assert isinstance(caught.value.error, UsageLimitExceeded)
        # The refused request was answered by an exception, so it cost nothing
        # and is not counted: the budget bounds requests the model answered.
        assert answered["n"] - 1 <= budget, answered["n"]

    def test_a_turn_that_loops_runs_out_rather_than_resuming_forever(self, integration_app):
        """A model that will not stop calling tools. The usage limit is not
        transient, so it ends the turn instead of buying three more goes."""
        sleep, _ = _no_waiting()

        def respond(messages, info: AgentInfo):
            return ModelResponse(parts=[ToolCallPart("list_sources", {})])

        with pytest.raises(TurnFailed) as caught:
            asyncio.run(
                run_turn(
                    build_agent(integration_app, FunctionModel(respond)),
                    "go",
                    max_requests=4,
                    sleep=sleep,
                )
            )

        assert isinstance(caught.value.error, UsageLimitExceeded)

    def test_a_session_already_near_its_budget_still_gets_a_full_turn(self, integration_app):
        """The budget is per turn. Counting the whole session against it would
        make the tenth message in a conversation fail for no reason."""
        sleep, _ = _no_waiting()
        history = [ModelResponse(parts=[TextPart(f"turn {n}")]) for n in range(10)]

        def respond(messages, info: AgentInfo):
            return ModelResponse(parts=[TextPart("fine")])

        result = asyncio.run(
            run_turn(
                build_agent(integration_app, FunctionModel(respond)),
                "and now this",
                history=history,
                max_requests=2,
                sleep=sleep,
            )
        )

        assert str(result.output) == "fine"


class TestStopStillStops:
    """The backoff is a wait, and a wait is somewhere Stop has to work. It is
    awaited inside the run task for that reason: `CancelledError` is not an
    `Exception`, so it passes straight through the retry handling rather than
    being mistaken for a failure worth another go.
    """

    def test_cancelling_during_the_backoff_is_not_retried(self, integration_app):
        model = _scripted(*([_overloaded()] * MAX_ATTEMPTS))
        cancelled = asyncio.CancelledError()

        async def sleep_then_cancel(_seconds):
            raise cancelled

        async def go():
            return await run_turn(
                build_agent(integration_app, model), "go", sleep=sleep_then_cancel
            )

        with pytest.raises(asyncio.CancelledError):
            asyncio.run(go())

        assert model.seen["n"] == 1, "a cancelled turn tried again"

    def test_cancelling_the_task_unwinds_the_wait(self, integration_app):
        """End to end: a real task, cancelled while it is waiting to resume."""
        model = _scripted(_overloaded(), ModelResponse(parts=[TextPart("too late")]))

        async def go():
            task = asyncio.create_task(
                run_turn(
                    build_agent(integration_app, model),
                    "go",
                    sleep=lambda _seconds: asyncio.sleep(30),
                )
            )
            # Let it reach the wait.
            await asyncio.sleep(0.05)
            task.cancel()
            await task

        with pytest.raises(asyncio.CancelledError):
            asyncio.run(go())

        assert model.seen["n"] == 1


class TestAnErrorAddressedToTheUser:
    def test_the_turn_budget_is_explained_in_terms_of_the_product(self):
        """pydantic-ai's own wording is "Consider raising the limit, or see the
        docs on usage limits", with a link to pydantic.dev. Accurate, and
        advice nobody using `visivo serve` can act on."""
        from visivo.agent.resilience import MAX_MODEL_REQUESTS, explain

        message = explain(UsageLimitExceeded("The next request would exceed..."))

        assert message is not None
        assert str(MAX_MODEL_REQUESTS) in message
        assert "pydantic" not in message.lower()
        # The two things someone needs: their work is not gone, and what to do.
        assert "drafts" in message
        assert "new message" in message

    def test_a_provider_failure_is_passed_through_unparaphrased(self):
        """The status code is what someone takes to their provider. Replacing
        it with a sentence of ours would take that away."""
        from visivo.agent.resilience import explain

        assert explain(_overloaded()) is None
