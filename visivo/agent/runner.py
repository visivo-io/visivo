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

from visivo.agent.loop import build_agent, usage_limits
from visivo.agent.sessions import SessionManager, SessionState
from visivo.logger.logger import Logger


def start(app, prompt, model, session_manager=None):
    """Create a session and run it in the background. Returns immediately."""
    manager = session_manager or SessionManager.instance()
    session = manager.create(prompt)
    thread = threading.Thread(
        target=_execute,
        args=(app, manager, session.id, prompt, model),
        daemon=True,
    )
    thread.start()
    return session


def _execute(app, manager, session_id, prompt, model):
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        agent = build_agent(app, model)
        task = loop.create_task(agent.run(prompt, usage_limits=usage_limits()))

        # Attached before the state flips to RUNNING, so there is no window in
        # which a session looks stoppable and is not.
        manager.attach_cancel(session_id, lambda: loop.call_soon_threadsafe(task.cancel))
        if manager.was_cancelled(session_id):
            return
        manager.set_state(session_id, SessionState.RUNNING)

        try:
            result = loop.run_until_complete(task)
        except asyncio.CancelledError:
            manager.set_state(session_id, SessionState.CANCELLED)
            return
        manager.set_state(session_id, SessionState.SUCCEEDED, output=str(result.output))
    except Exception as error:  # noqa: BLE001 — reported to the session, never raised
        # An agent failure is a failure: it belongs in the same place every
        # other error goes, not a bespoke red box.
        Logger.instance().error(f"Agent session {session_id} failed: {error}")
        manager.set_state(session_id, SessionState.FAILED, error=str(error))
    finally:
        try:
            loop.close()
        except Exception:
            pass
