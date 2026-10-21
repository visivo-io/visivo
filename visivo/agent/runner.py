"""Starting the loop, and stopping it.

The loop is async and Flask's threading mode is not, so a session owns an
event loop on its own thread. That is also what makes it cancellable: the wait
someone presses Stop during is inside a model call, and cancelling the task
unwinds it. A flag checked between turns would not — it would wait out the very
call the user is trying to escape.

A cancelled loop keeps whatever it already wrote. Those are drafts, which are
the discardable unit; rolling them back would decide for the user something
they can decide themselves, and discarding is one click (#699).
"""

import asyncio
import threading

from visivo.agent.actions import attributed_to, log as action_log
from visivo.agent.loop import MAX_MODEL_REQUESTS, MAX_TOOL_CALLS, build_agent
from visivo.agent import resilience
from visivo.agent.resilience import TurnFailed, run_turn, timeline
from visivo.agent.sessions import SessionManager, SessionState
from visivo.logger.logger import Logger


def start(app, prompt, model, session_manager=None, session_id=None):
    """Answer ``prompt``, in a new conversation or the one named by
    ``session_id``. Returns immediately; the turn runs in the background.

    A named session that no longer exists returns ``None`` rather than starting
    a fresh one — the user believes they are still in a conversation, and
    silently giving them a new one loses everything it was about.
    """
    manager = session_manager or SessionManager.instance()
    if session_id:
        session = manager.add_turn(session_id, prompt)
        if session is None:
            return None
    else:
        session = manager.create(prompt)

    thread = threading.Thread(
        target=_execute,
        args=(app, manager, session.id, prompt, model),
        daemon=True,
    )
    thread.start()
    return session


def _execute(app, manager, session_id, prompt, model):
    from visivo.agent import cloud_model

    # Bound before the try: the handler reports it, and an exception raised
    # before the assignment would otherwise NameError inside `except` and
    # replace the real failure with a bug in the reporting of it.
    endpoint = cloud_model.endpoint_of(model)
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        if endpoint:
            # Said at the start, not only on failure: "which server is this
            # talking to" should not require something to go wrong first.
            Logger.instance().info(f"Agent session {session_id} using {endpoint}")
        agent = build_agent(app, model)
        # Everything said so far, so a follow-up means something. Read before
        # the turn starts and passed whole — pydantic-ai needs its own message
        # objects back, including tool calls and their results, or it re-runs
        # work it has already done.
        history = list(getattr(manager.get(session_id), "history", []) or [])
        # Where the shared log stands before this turn touches it. The log is
        # process-wide — an MCP client can be working through the same serve —
        # so a turn reports what it did by slice, never by clearing.
        mark = action_log().marker()

        # Set before the task exists: the task copies this context, and so do
        # the threads it runs sync tools in.
        def report(captured, carried):
            """What the turn has said and done so far, onto the session the tab
            polls.

            The actions come from the same `since(mark, session_id)` slice the
            finished turn uses, so the list a person watches fill in is the
            list they end up with — not a second one assembled differently.
            """
            actions = action_log().since(mark, session_id=session_id)
            manager.progress(
                session_id,
                items=timeline(captured, actions, carried=carried),
                actions=actions,
            )

        with attributed_to("agent", session_id):
            task = loop.create_task(
                run_turn(
                    agent,
                    prompt,
                    history=history,
                    max_requests=MAX_MODEL_REQUESTS,
                    max_tool_calls=MAX_TOOL_CALLS,
                    report=report,
                )
            )

        # Attached before the state flips to RUNNING, so there is no window in
        # which a session looks stoppable and is not.
        manager.attach_cancel(session_id, lambda: loop.call_soon_threadsafe(task.cancel))
        if manager.was_cancelled(session_id):
            return
        manager.set_state(session_id, SessionState.RUNNING)

        try:
            result = loop.run_until_complete(task)
        except asyncio.CancelledError:
            # Settle what the turn got through before Stop. `remember` is not
            # called on this path, and it used to be the only writer of a
            # turn's tool calls — so a cancelled turn showed none of the work
            # it had actually done, which reads as though Stop undid it.
            manager.settle(session_id, actions=action_log().since(mark, session_id=session_id))
            manager.set_state(session_id, SessionState.CANCELLED)
            return
        answer = str(result.output)
        # Persisted BEFORE the state flips, so a poll that sees "succeeded"
        # cannot arrive ahead of the answer it is being told about.
        manager.remember(
            session_id,
            result.all_messages(),
            answer,
            actions=action_log().since(mark, session_id=session_id),
        )
        manager.set_state(session_id, SessionState.SUCCEEDED, output=answer)
    except Exception as error:  # noqa: BLE001 — reported to the session, never raised
        # Whatever the turn learned before it died, so "try again" continues
        # rather than restarting. Only `TurnFailed` carries this; a failure
        # from anywhere else in this function has no conversation attached.
        if isinstance(error, TurnFailed):
            manager.remember(
                session_id,
                error.messages,
                None,
                actions=action_log().since(mark, session_id=session_id),
            )
            error = error.error
        # An agent failure is a failure: it belongs in the same place every
        # other error goes, not a bespoke red box. But a failure that is OURS
        # should not be reported as the model provider's.
        Logger.instance().error(
            f"Agent session {session_id} failed"
            + (f" (inference endpoint: {endpoint})" if endpoint else "")
            + f": {error}"
        )
        manager.set_state(
            session_id,
            SessionState.FAILED,
            # Ours first: a 404 on our own inference route must not be
            # reported as the provider's. Then the failures whose own message
            # is addressed to a library author. Then the error as it came.
            error=(
                cloud_model.explain(error, model=model) or resilience.explain(error) or str(error)
            ),
            # A spend limit is not a broken agent. Tagged so the tab can say
            # so rather than showing it in the same red box as a crash.
            action=cloud_model.LIMIT_REACHED if cloud_model.limit_reached(error) else None,
        )
    finally:
        try:
            loop.close()
        except Exception:
            pass
