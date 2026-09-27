"""One run of the built-in loop, and the handle to stop it.

Mirrors ``RunManager``: the caller creates a session, a daemon thread executes
it, and the client polls. A loop that talks to a model for a minute cannot hold
an HTTP request open, and the viewer already knows how to poll a run.

The cancel handle is what makes this more than a status dict. "A running loop
the user cannot stop is not shippable" is the ticket's wording, and a flag the
loop checks between turns is not the same thing — the wait is inside a model
call, which is exactly where someone presses stop.
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

    def to_dict(self):
        return {
            "id": self.id,
            "state": self.state.value,
            "prompt": self.prompt,
            "output": self.output,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


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
        with self._lock:
            newest = list(reversed(self._order))[:limit]
            return [self._sessions[i].to_dict() for i in newest if i in self._sessions]

    def active(self):
        with self._lock:
            return [s for s in self._sessions.values() if s.state not in FINISHED]

    def set_state(self, session_id, state, output=None, error=None):
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
