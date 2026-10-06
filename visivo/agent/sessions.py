"""A conversation with the built-in loop, and the handle to stop it.

Mirrors ``RunManager``: the caller creates a session, a daemon thread executes
it, and the client polls. A loop that talks to a model for a minute cannot hold
an HTTP request open, and the viewer already knows how to poll a run.

The cancel handle is what makes this more than a status dict. "A running loop
the user cannot stop is not shippable" is the ticket's wording, and a flag the
loop checks between turns is not the same thing — the wait is inside a model
call, which is exactly where someone presses stop.

## A session is a conversation, not a request

Each turn is answered with the whole history in front of the model, so "now add
a chart to that" means something. Without it every prompt starts from nothing
and the agent is a one-shot tool wearing a chat box.

History is pydantic-ai's own message objects, kept as they came back rather
than re-derived from our transcript: the model has to be given exactly the turn
it produced — including tool calls and their results — or it re-runs work it
already did.
"""

import threading
import uuid
from datetime import datetime
from enum import Enum

MAX_SESSIONS = 50


class SessionState(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


FINISHED = (SessionState.SUCCEEDED, SessionState.FAILED, SessionState.CANCELLED)


class Session:
    def __init__(self, session_id, prompt):
        self.id = session_id
        self.prompt = prompt
        self.state = SessionState.QUEUED
        self.output = None
        self.error = None
        self.created_at = datetime.now()
        self.updated_at = self.created_at
        self._cancel = None
        # Why it failed, when "why" is something a reader can act on rather
        # than a bug. Mirrors the action codes the endpoints already return, so
        # the tab has one branch for a limit however it was hit.
        self.action = None
        # pydantic-ai's own message objects, for the model.
        self.history = []
        # What a person reads. Kept separately because the two answer different
        # questions: the model needs its own tool calls replayed verbatim, a
        # reader needs to know who said what.
        self.transcript = []

    def say(self, role, text, actions=None):
        """Add to what a person reads.

        An agent turn carries the tool calls it made, so the answer can be read
        next to the work rather than beside an undated list that may also hold
        an MCP client's.
        """
        entry = {
            "role": role,
            "text": text,
            "at": datetime.now().isoformat(),
            "actions": list(actions or []),
        }
        self.transcript.append(entry)
        return entry

    def to_dict(self, with_transcript=True):
        payload = {
            "id": self.id,
            "state": self.state.value,
            "prompt": self.prompt,
            "output": self.output,
            "error": self.error,
            "action": self.action,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "turns": len(self.transcript),
        }
        if with_transcript:
            payload["transcript"] = list(self.transcript)
        return payload


class SessionManager:
    _instance = None
    _instance_lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._init()
        return cls._instance

    def _init(self):
        self._sessions = {}
        self._order = []
        self._lock = threading.Lock()

    @classmethod
    def instance(cls):
        return cls()

    def create(self, prompt):
        session = Session(str(uuid.uuid4()), prompt)
        session.say("user", prompt)
        with self._lock:
            self._sessions[session.id] = session
            self._order.append(session.id)
            while len(self._order) > MAX_SESSIONS:
                self._sessions.pop(self._order.pop(0), None)
        return session

    def get(self, session_id):
        with self._lock:
            return self._sessions.get(session_id)

    def list(self, limit=20):
        """Without transcripts — a list of conversations is not a place to send
        every message of every one of them."""
        with self._lock:
            newest = list(reversed(self._order))[:limit]
            return [
                self._sessions[i].to_dict(with_transcript=False)
                for i in newest
                if i in self._sessions
            ]

    def add_turn(self, session_id, prompt):
        """Continue an existing conversation. Returns the session, or None if
        it has been evicted — a caller must not silently start a new one under
        an id the user thinks they are still talking to."""
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return None
            session.prompt = prompt
            session.output = None
            session.error = None
            session.state = SessionState.QUEUED
            session.updated_at = datetime.now()
            session.say("user", prompt)
            return session

    def remember(self, session_id, history, answer, actions=None):
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return
            session.history = history
            if answer:
                session.say("agent", answer, actions=actions)

    def active(self):
        with self._lock:
            return [s for s in self._sessions.values() if s.state not in FINISHED]

    def set_state(self, session_id, state, output=None, error=None, action=None):
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return
            session.state = state
            session.updated_at = datetime.now()
            if output is not None:
                session.output = output
            if error is not None:
                session.error = error
            if action is not None:
                session.action = action

    def attach_cancel(self, session_id, cancel):
        """Registered BEFORE the loop starts. Registering after would leave a
        window where the session is running and Stop does nothing."""
        with self._lock:
            session = self._sessions.get(session_id)
            if session is not None:
                session._cancel = cancel

    def cancel(self, session_id):
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                return False
            if session.state in FINISHED:
                return False
            cancel = session._cancel
        if cancel is None:
            # Queued but not yet attached: mark it so the thread sees the
            # decision when it gets there rather than starting anyway.
            self.set_state(session_id, SessionState.CANCELLED)
            return True
        cancel()
        return True

    def was_cancelled(self, session_id):
        session = self.get(session_id)
        return session is not None and session.state == SessionState.CANCELLED
