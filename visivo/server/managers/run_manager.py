"""RunManager — local serve's in-memory run registry for the run-on-save loop.

Mirrors the cloud's ``Run`` just enough that the viewer's run-poller
(``runStore.pollRuns`` -> ``GET /api/projects/<id>/run/``), the Runs view, and
the ``runDataVersion`` soft-refresh work locally unchanged. A run is created on
each save (see ``request_run``), executes the cached-injected, DAG-filtered
rebuild into the ``main`` target dir on a background thread, and flips
``queued`` -> ``running`` -> ``succeeded``/``failed``. Single-user, in-process —
there is no runner/callback, and "superseded" is simply "a newer run exists".
"""

import threading
import uuid
from datetime import datetime
from enum import Enum

# Cap the registry so a long editing session can't grow unbounded. The viewer
# only ever reads the most recent handful (latest + the Runs list).
_MAX_RUNS = 50


class RunState(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELED = "canceled"


# States the viewer treats as "still going" (mirrors ACTIVE_RUN_STATES).
ACTIVE_STATES = (RunState.QUEUED, RunState.RUNNING)


class Run:
    """One on-save run. ``dag_filter`` is the visivo selector that scoped it
    (``+name+,...``), ``logs`` is the captured build output, ``error_json`` the
    structured failure (``{phase, ...}``) when it fails."""

    def __init__(self, run_id, dag_filter):
        self.id = run_id
        self.dag_filter = dag_filter
        self.state = RunState.QUEUED
        self.created_at = datetime.now()
        self.updated_at = self.created_at
        self.logs = ""
        self.error_json = None

    def to_dict(self, is_superseded=False):
        """Cloud ``RunSerializer`` shape, so ``fetchRuns`` needs no local branch."""
        return {
            "id": self.id,
            "state": self.state.value,
            "dag_filter": self.dag_filter,
            "error_json": self.error_json,
            "is_superseded": is_superseded,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class RunManager:
    """Thread-safe singleton registry of on-save runs (one per Flask process)."""

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
        self._runs = {}  # id -> Run
        self._order = []  # ids, oldest first
        self._lock = threading.Lock()

    @classmethod
    def instance(cls):
        return cls()

    def create(self, dag_filter):
        run = Run(str(uuid.uuid4()), dag_filter)
        with self._lock:
            self._runs[run.id] = run
            self._order.append(run.id)
            # Evict oldest beyond the cap.
            while len(self._order) > _MAX_RUNS:
                evicted = self._order.pop(0)
                self._runs.pop(evicted, None)
        return run

    def get(self, run_id):
        with self._lock:
            return self._runs.get(run_id)

    def set_state(self, run_id, state, logs=None, error_json=None):
        with self._lock:
            run = self._runs.get(run_id)
            if run is None:
                return
            run.state = state
            run.updated_at = datetime.now()
            if logs is not None:
                run.logs = logs
            if error_json is not None:
                run.error_json = error_json

    def append_logs(self, run_id, chunk):
        if not chunk:
            return
        with self._lock:
            run = self._runs.get(run_id)
            if run is None:
                return
            run.logs += chunk
            run.updated_at = datetime.now()

    def list(self, limit=20):
        """Newest-first run dicts. The newest run is current; the rest are
        superseded (a newer run exists)."""
        with self._lock:
            ids = list(reversed(self._order))[:limit]
            runs = [self._runs[i] for i in ids if i in self._runs]
        newest_id = runs[0].id if runs else None
        return [run.to_dict(is_superseded=run.id != newest_id) for run in runs]
