"""Surviving a bad turn.

A turn is 40 model requests and up to 100 tool calls. The failure mode this
module exists for is the arithmetic of that: a single transient refusal on
request 30 used to end the turn, and because a failed turn was never
remembered, the 29 requests before it were discarded with it. The user saw a
provider's status line where an answer should have been, and a follow-up
started from nothing.

Two things fix that, and they are different things.

**Resume, do not restart.** ``capture_run_messages`` gives us the conversation
as it stood when the call failed — including tool calls and their results — so
the next attempt is handed that history and carries on. The work already done
is not repeated, which matters for cost and matters more for tools that are not
free to call twice.

**Keep the history even when it finally fails.** A turn that exhausts its
attempts still learned something. Handing that back to the session means "try
again" is a continuation rather than a restart.

What is NOT retried is as deliberate as what is. A spend limit, a bad key, a
404 on our own inference route and a model that has been told what it got
wrong and is repeating itself anyway are all answers, not noise. Retrying an
answer just spends someone's money to reach it again more slowly.
"""

import asyncio

from pydantic_ai import capture_run_messages
from pydantic_ai.messages import ModelResponse
from pydantic_ai.usage import UsageLimits

from visivo.agent import cloud_model
from visivo.logger.logger import Logger

# One turn tolerates this many transient failures. Three because the pattern
# we are covering is a provider shedding load for a few seconds; a fourth
# consecutive refusal is a provider that is down, and waiting longer in front
# of a spinner does not make it less down.
MAX_ATTEMPTS = 4

# Seconds before each resumption. Long enough to let a rate limit drain,
# short enough that someone watching does not conclude it has hung. Awaited
# inside the run task, so Stop still interrupts it.
BACKOFF_SECONDS = (2, 6, 15)

# Statuses worth another go. 429 is a rate limit, 5xx is the provider's side,
# 529 is Anthropic's "overloaded". 408/409 are retried for the same reason a
# plain HTTP client retries them.
RETRYABLE_STATUSES = frozenset({408, 409, 425, 429, 500, 502, 503, 504, 529})

# What one turn may spend, on a BYO key or on Visivo's credit. Sized for
# "explore a source and build a dashboard" (~35 calls). Here rather than in
# `loop` because `explain` quotes the figures, and a message naming a different
# number from the one being enforced is worse than one naming none.
MAX_MODEL_REQUESTS = 40
MAX_TOOL_CALLS = 100


MALFORMED_CALL = "Malformed function call"


def is_transient(error):
    """Whether another attempt could plausibly do better.

    Deliberately narrow. The default is "no", because the cost of a wrong
    "yes" is spending a user's credit on a failure that was already final.
    """
    from pydantic_ai.exceptions import (
        ContentFilterError,
        IncompleteToolCall,
        ModelAPIError,
        ModelHTTPError,
    )

    # A spend limit arrives as a 429 from our own proxy. It is the one 429
    # that will never clear by waiting, and core has already phrased it.
    if cloud_model.limit_reached(error):
        return False

    if isinstance(error, ModelHTTPError):
        return error.status_code in RETRYABLE_STATUSES

    # Gemini sometimes writes a tool call as Python (`print(default_api.x(...))`).
    # The relay reports it as a content-filter refusal, but nothing was refused:
    # the same request usually comes back well formed. A real refusal stays final.
    if isinstance(error, ContentFilterError):
        return MALFORMED_CALL in str(error)

    # A truncated tool call — the model was cut off mid-argument. Nothing is
    # wrong with the request, so sending it again is reasonable.
    if isinstance(error, IncompleteToolCall):
        return True

    # Everything else at the API layer is a connection: DNS, a reset, a read
    # timeout. `ModelAPIError` is the base pydantic-ai wraps those in.
    if isinstance(error, ModelAPIError):
        return True

    return _is_transport_error(error)


def _is_transport_error(error):
    """An httpx-level failure that reached us unwrapped.

    Matched by class rather than imported, because this has to hold for both
    httpx and httpx2 and pydantic-ai is mid-migration between them. Importing
    both to isinstance against them would make this module care which one a
    provider happens to use.
    """
    for klass in type(error).__mro__:
        if klass.__name__ in ("TransportError", "TimeoutException", "NetworkError"):
            return True
    return False


def _requests_in(messages):
    """How many model requests a conversation represents.

    Counted from the transcript rather than read off the exception, which does
    not carry usage. One ``ModelResponse`` is one answered request, which is
    exactly what ``request_limit`` bounds.
    """
    return sum(1 for message in messages if isinstance(message, ModelResponse))


# The viewer polls at 1s, so reporting faster buys nothing.
PROGRESS_INTERVAL_SECONDS = 0.5


def timeline(messages, actions, carried=()):
    """What the turn has said and done, interleaved, in the order it happened.

    ``carried`` is the history this turn started with, excluded by identity
    because ``capture_run_messages`` captures the whole conversation. Actions
    are matched to tool calls by position, so several calls issued in one
    response are labelled in written rather than executed order.
    """
    from pydantic_ai.messages import ModelResponse, TextPart, ToolCallPart

    items = []
    taken = 0
    before = {id(message) for message in carried}
    for message in [m for m in messages if id(m) not in before]:
        if not isinstance(message, ModelResponse):
            continue
        for part in message.parts:
            if isinstance(part, TextPart) and (part.content or "").strip():
                items.append({"kind": "text", "text": part.content.strip()})
            elif isinstance(part, ToolCallPart) and taken < len(actions):
                items.append({"kind": "action", "action": actions[taken]})
                taken += 1
    # A call is recorded before its handler runs, so the log can lead the messages.
    for action in actions[taken:]:
        items.append({"kind": "action", "action": action})
    return items


async def _report_until_done(task, captured, report, carried):
    """Tell ``report`` what the turn has done, until the turn is done.

    Runs in the turn's own event loop, since ``captured`` is appended to from
    it. Sleeps on ``asyncio.sleep`` and not the injected backoff sleep, which a
    test may make instant — that would starve the task being watched.
    """
    while not task.done():
        await asyncio.sleep(PROGRESS_INTERVAL_SECONDS)
        try:
            report(list(captured), carried)
        except Exception:
            pass


class TurnFailed(Exception):
    """A turn that ran out of attempts, carrying what it had learned.

    The history is the point. Without it the caller has an error and no way to
    let the user continue from where the turn got to.
    """

    def __init__(self, error, messages):
        super().__init__(str(error))
        self.error = error
        self.messages = list(messages or [])


async def run_turn(
    agent,
    prompt,
    history=None,
    max_requests=MAX_MODEL_REQUESTS,
    max_tool_calls=MAX_TOOL_CALLS,
    sleep=None,
    report=None,
):
    """Answer ``prompt``, resuming through transient failures.

    Returns pydantic-ai's run result. Raises ``TurnFailed`` — carrying the
    conversation so far — when it cannot, and lets anything non-transient
    through on the first encounter.

    ``max_requests`` is a budget for the whole TURN, not per attempt. A
    resumption that reset it would turn a cap of 40 into a cap of 160 at
    exactly the moment things are going wrong.
    """
    sleep = sleep or asyncio.sleep
    messages = list(history or [])
    # What the conversation already cost before this turn, so the budget below
    # is spend on THIS turn rather than on the session.
    already = _requests_in(messages)

    for attempt in range(MAX_ATTEMPTS):
        remaining = max_requests - (_requests_in(messages) - already)
        if remaining <= 0:
            break
        limits = UsageLimits(request_limit=remaining, tool_calls_limit=max_tool_calls)

        with capture_run_messages() as captured:
            try:
                # The prompt goes in once. On a resumption it is already in
                # `messages` as a UserPromptPart, and sending it again would
                # read to the model as the user repeating themselves.
                task = asyncio.ensure_future(
                    agent.run(
                        prompt if attempt == 0 else None,
                        message_history=messages,
                        usage_limits=limits,
                    )
                )
                watcher = (
                    asyncio.ensure_future(
                        _report_until_done(task, captured, report, tuple(messages))
                    )
                    if report
                    else None
                )
                try:
                    return await task
                finally:
                    if watcher is not None:
                        watcher.cancel()
            except Exception as error:
                # `captured` is the whole conversation, not just this attempt,
                # so it replaces `messages` rather than extending it.
                if captured:
                    messages = list(captured)
                if not is_transient(error) or attempt == MAX_ATTEMPTS - 1:
                    raise TurnFailed(error, messages) from error
                wait = BACKOFF_SECONDS[min(attempt, len(BACKOFF_SECONDS) - 1)]
                Logger.instance().info(
                    f"Agent turn hit a transient failure ({error}); "
                    f"resuming in {wait}s with {len(messages)} messages of context"
                )
                await sleep(wait)

    raise TurnFailed(
        RuntimeError(f"The turn reached its budget of {max_requests} model requests."),
        messages,
    )


def explain(error):
    """A sentence about ``error`` worth showing someone, or ``None``.

    Covers the failures whose own message is addressed to a library author
    rather than to a user. pydantic-ai's limit error, for instance, reads
    "The next request would exceed the request_limit of 40. Consider raising
    the limit, or see the docs on usage limits" and links to pydantic.dev —
    accurate, and advice nobody using `visivo serve` can take.

    Provider failures are NOT covered. ``cloud_model.explain`` already owns
    the ones that are ours to explain, and paraphrasing the rest would hide
    the status code someone needs in order to ask their provider about it.
    """
    from pydantic_ai.exceptions import UsageLimitExceeded

    if isinstance(error, UsageLimitExceeded):
        return (
            "The agent reached the limit of what one turn may do "
            f"({MAX_MODEL_REQUESTS} model requests, {MAX_TOOL_CALLS} tool calls). "
            "Whatever it finished is in your drafts. Ask for the next step as a "
            "new message — it keeps the conversation, so it will not start over."
        )
    return None
