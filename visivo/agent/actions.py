"""What an agent did, kept so something can show it.

The Agent tab lists tool calls — what ran, against which object, what changed,
what failed — and until this existed nothing recorded any of it: ``call()`` ran
a tool and returned, and the action was gone.

## In memory, and bounded

An action log describes drafts, and the draft tier is itself in-memory and dies
with the serve process. A log that outlived it would refer to objects that no
longer exist. It is a window on the current session, not an archive, so it is
capped and the oldest entries fall off.

## Structured, not prose

The tab renders links from an entry, and nothing can be done with a sentence.
``object`` is what makes an entry navigable — the tab addresses objects as
``type:name``, the same identity the rename flow uses.
"""

import contextvars
import itertools
import threading
import time
from contextlib import contextmanager

# A window, not an archive. Large enough that a long agent session stays
# readable, small enough that an idle serve process is not holding a
# transcript.
MAX_ACTIONS = 500

_counter = itertools.count(1)

# Who is calling, for the tab to tell the built-in loop's work (shown with the
# turn that did it) from an external MCP client's. Unset means unattributed —
# the cloud runner records without it, and its calls are all the loop's.
_caller = contextvars.ContextVar("agent_action_caller", default=(None, None))


@contextmanager
def attributed_to(source, session_id=None):
    """Attribute every action recorded inside to ``source`` (``"agent"`` or
    ``"mcp"``) and, for the built-in loop, its session."""
    token = _caller.set((source, session_id))
    try:
        yield
    finally:
        _caller.reset(token)


def caller():
    """``(source, session_id)`` for the code running now."""
    return _caller.get()


class ActionLog:
    """The session's agent actions, newest last. Safe across serve's threads."""

    def __init__(self, limit=MAX_ACTIONS):
        self._actions = []
        self._limit = limit
        self._lock = threading.Lock()
        self._listeners = []

    def on_record(self, listener):
        """Call ``listener(action)`` whenever one is recorded, so this module
        stays ignorant of how an action reaches anyone."""
        self._listeners.append(listener)
        return listener

    def record(self, tool, *, obj=None, outcome="ok", error=None, summary=None):
        source, session_id = _caller.get()
        action = {
            "id": next(_counter),
            "timestamp": time.time(),
            "tool": tool,
            "object": obj,
            "outcome": outcome,
            "error": error,
            "summary": summary or _summarise(tool, obj, outcome, error),
            "source": source,
            "session_id": session_id,
        }
        with self._lock:
            self._actions.append(action)
            if len(self._actions) > self._limit:
                del self._actions[: len(self._actions) - self._limit]
        self._notify(action)
        return action

    def _notify(self, action):
        """A listener that fails must not fail the recording — the action
        really happened, and the log is still readable."""
        for listener in list(self._listeners):
            try:
                listener(action)
            except Exception:
                pass

    def marker(self):
        """Where the log stands now, for pairing with ``since``.

        Ids come from a process-wide counter, so a marker stays meaningful even
        though entries fall off the end of a bounded log.
        """
        with self._lock:
            return self._actions[-1]["id"] if self._actions else 0

    def since(self, marker, session_id=None):
        """Everything recorded after ``marker``, oldest first.

        How a turn learns what IT did. The log is shared — an MCP client can be
        working through the same serve process — so scoping a turn by clearing
        the log would take someone else's history with it, and counting entries
        would miscount the moment the cap discards one.
        """
        with self._lock:
            return [
                action
                for action in self._actions
                if action["id"] > marker
                and (session_id is None or action["session_id"] == session_id)
            ]

    def recent(self, limit=None):
        """Newest first — what a log is read in.

        A copy, because reading the log must never let a caller mutate it: it
        is the one surface an agent's work is inspected from.
        """
        with self._lock:
            newest = list(reversed(self._actions))
        return newest[:limit] if limit else newest

    def clear(self):
        with self._lock:
            self._actions.clear()


def _summarise(tool, obj, outcome, error):
    """One line for a reader skimming, derived rather than written per tool."""
    target = f" {obj['type']} '{obj['name']}'" if obj else ""
    if outcome == "error":
        return f"{tool}{target} failed: {error}" if error else f"{tool}{target} failed"
    return f"{tool}{target}".strip()


# The serve process has one project and one log. A transport takes it from
# here rather than holding its own, so every producer writes to the same one.
_log = ActionLog()


def log():
    return _log
