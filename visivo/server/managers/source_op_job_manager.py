"""SourceOpJobManager - runs source operations asynchronously.

Source ops (test a connection, gather the source-metadata tree) reach out to a
warehouse, so they take as long as the warehouse takes. They used to run inside
the request and return the result at 200.

They are jobs now, for the same reason model queries already are: the cloud
server executes them on a warm runner pool, and nothing can dial into one of
those pods, so there is no request to hold open. It answers ``202 {job_id}``
and the client polls. Rather than teach the viewer two contracts and leave the
polling path exercised only in production, the local server speaks the same one
— so `visivo serve` runs the same code path cloud does.

The status vocabulary is ``RunStatus`` (queued/running/completed/failed/
cancelled) and the poll envelope matches ``ModelQueryJob.to_dict``, which is
what makes one viewer work against both servers unchanged.

Deliberately narrower than ModelQueryJobManager: no config hashing (these ops
aren't deduplicated) and no run_id (no FilteredRunner involved). The two could
reasonably be folded together later; that refactor is not this change.
"""

import threading
import uuid
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, Optional

from visivo.logger.logger import Logger
from visivo.server.managers.preview_run_manager import RunStatus


class SourceOpJob:
    """One source operation in flight."""

    def __init__(self, job_id: str, kind: str):
        self.job_id = job_id
        self.kind = kind
        self.status = RunStatus.QUEUED
        self.created_at = datetime.now()
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.progress: float = 0.0
        self.progress_message: str = "Queued"
        self.result: Optional[Any] = None
        self.error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """The poll envelope. Matches ModelQueryJob.to_dict (and core's
        equivalent) field for field — that identity is the whole point."""
        data = {
            "job_id": self.job_id,
            "kind": self.kind,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "progress": self.progress,
            "progress_message": self.progress_message,
            "error": self.error,
        }
        if self.status == RunStatus.COMPLETED and self.result is not None:
            data["result"] = self.result
        return data


class SourceOpJobManager:
    """Thread-safe registry of in-flight source ops. Singleton per Flask app."""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(SourceOpJobManager, cls).__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if getattr(self, "_initialized", False):
            return
        self._initialized = True
        self._jobs: Dict[str, SourceOpJob] = {}
        self._jobs_lock = threading.Lock()
        self._cleanup_interval = 1800
        self._max_job_age = timedelta(hours=1)
        self._start_cleanup_thread()
        Logger.instance().info("SourceOpJobManager initialized")

    @classmethod
    def instance(cls) -> "SourceOpJobManager":
        return cls()

    def start(self, kind: str, work: Callable[[], Any]) -> str:
        """Register a job, run ``work`` on a background thread, return its id.

        ``work`` is called with no arguments and its return value becomes the
        job's result. Anything it raises becomes the job's error rather than an
        exception on a thread nobody is watching — an op that dies silently
        would leave the viewer polling forever.
        """
        job_id = str(uuid.uuid4())
        with self._jobs_lock:
            self._jobs[job_id] = SourceOpJob(job_id, kind)

        def _run():
            self._mark(job_id, RunStatus.RUNNING, progress_message="Running")
            try:
                result = work()
            except Exception as exc:
                Logger.instance().error(f"Source op {kind} ({job_id}) failed: {exc}")
                self._mark(job_id, RunStatus.FAILED, error=str(exc))
                return
            self._complete(job_id, result)

        threading.Thread(target=_run, daemon=True).start()
        return job_id

    def get_job(self, job_id: str) -> Optional[SourceOpJob]:
        with self._jobs_lock:
            return self._jobs.get(job_id)

    def _mark(self, job_id, status, *, progress_message=None, error=None):
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job.status = status
            if status == RunStatus.RUNNING and not job.started_at:
                job.started_at = datetime.now()
            if status in (RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED):
                job.completed_at = datetime.now()
            if progress_message is not None:
                job.progress_message = progress_message
            if error is not None:
                job.error = error

    def _complete(self, job_id, result):
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            if not job:
                return
            job.result = result
            job.status = RunStatus.COMPLETED
            job.progress = 1.0
            job.progress_message = "Complete"
            job.completed_at = datetime.now()

    def _cleanup_old_jobs(self):
        now = datetime.now()
        with self._jobs_lock:
            expired = [
                job_id
                for job_id, job in self._jobs.items()
                if (now - job.created_at) > self._max_job_age
            ]
            for job_id in expired:
                del self._jobs[job_id]
        if expired:
            Logger.instance().debug(f"Cleaned up {len(expired)} expired source op job(s)")

    def _start_cleanup_thread(self):
        def cleanup_loop():
            import time

            while True:
                time.sleep(self._cleanup_interval)
                try:
                    self._cleanup_old_jobs()
                except Exception as e:
                    Logger.instance().error(f"Error in source op job cleanup: {e}")

        threading.Thread(target=cleanup_loop, daemon=True).start()
