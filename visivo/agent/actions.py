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

import itertools
import threading
import time

# A window, not an archive. Large enough that a long agent session stays
# readable, small enough that an idle serve process is not holding a
# transcript.
MAX_ACTIONS = 500

_counter = itertools.count(1)


class ActionLog:
    """The session's agent actions, newest last. Safe across serve's threads."""

    def __init__(self, limit=MAX_ACTIONS):
        self._actions = []
        self._limit = limit
        self._lock = threading.Lock()

    def record(self, tool, *, obj=None, outcome="ok", error=None, summary=None):
        action = {
            "id": next(_counter),
            "timestamp": time.time(),
            "tool": tool,
            "object": obj,
            "outcome": outcome,
            "error": error,
            "summary": summary or _summarise(tool, obj, outcome, error),
        }
        with self._lock:
            self._actions.append(action)
            if len(self._actions) > self._limit:
                del self._actions[: len(self._actions) - self._limit]
        return action

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
