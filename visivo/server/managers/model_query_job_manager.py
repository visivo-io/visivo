"""
ModelQueryJobManager - Manages async SQL query execution and lifecycle

Handles:
- Job creation and ID generation
- Job status tracking (queued, running, completed, failed, cancelled)
- Result storage and retrieval
- Automatic cleanup of old jobs

Follows the same pattern as PreviewRunManager for consistency.
"""

import hashlib
import json
import threading
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from visivo.server.managers.preview_run_manager import RunStatus
from visivo.logger.logger import Logger


class ModelQueryJob:
    """Represents a single model query job"""

    def __init__(self, job_id: str, config: Dict[str, Any]):
        self.job_id = job_id
        self.run_id: Optional[str] = None
        self.config = config
        self.config_hash = self._compute_config_hash(config)
        self.status = RunStatus.QUEUED
        self.created_at = datetime.now()
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.progress: float = 0.0
        self.progress_message: str = "Queued"
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None

    @staticmethod
    def _compute_config_hash(config: Dict[str, Any]) -> str:
        """Compute a stable hash of the config for deduplication"""
        config_str = json.dumps(config, sort_keys=True)
        return hashlib.sha256(config_str.encode()).hexdigest()

    def to_dict(self) -> Dict[str, Any]:
        """Serialize job to dictionary"""
        data = {
            "job_id": self.job_id,
            "run_id": self.run_id,
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


class ModelQueryJobManager:
    """
    Manages model query jobs with automatic cleanup and thread-safe operations.

    Singleton pattern ensures single instance across Flask app.
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(ModelQueryJobManager, cls).__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if getattr(self, "_initialized", False):
            return

        Logger.instance().info("Initializing ModelQueryJobManager")
        self._initialized = True
        self._jobs: Dict[str, ModelQueryJob] = {}
        self._jobs_lock = threading.Lock()
        self._cleanup_interval = 1800  # 30 minutes in seconds
        self._max_job_age = timedelta(hours=1)
        self._start_cleanup_thread()
        Logger.instance().info("ModelQueryJobManager initialization complete")

    @classmethod
    def instance(cls) -> "ModelQueryJobManager":
        """Get singleton instance"""
        return cls()

    def create_job(self, config: Dict[str, Any]) -> str:
        """
        Create a new model query job.

        Args:
            config: Query configuration (source_name, sql, limit)

        Returns:
            Job ID (UUID string)
        """
        job_id = str(uuid.uuid4())
        job = ModelQueryJob(job_id, config)

        with self._jobs_lock:
            self._jobs[job_id] = job

        Logger.instance().debug(f"Created new model query job {job_id}")
        return job_id

    def get_job(self, job_id: str) -> Optional[ModelQueryJob]:
        """Get job by ID"""
        with self._jobs_lock:
            return self._jobs.get(job_id)

    def update_status(
        self,
        job_id: str,
        status: RunStatus,
        progress: Optional[float] = None,
        progress_message: Optional[str] = None,
        error: Optional[str] = None,
    ):
        """
        Update job status and progress.

        Args:
            job_id: Job identifier
            status: New status
            progress: Progress percentage (0.0 to 1.0)
            progress_message: Human-readable progress message
            error: Error message if failed
        """
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            if not job:
                Logger.instance().warning(f"Attempted to update non-existent job {job_id}")
                return

            job.status = status

            if status == RunStatus.RUNNING and not job.started_at:
                job.started_at = datetime.now()

            if status in (RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED):
                job.completed_at = datetime.now()
                job.progress = 1.0 if status == RunStatus.COMPLETED else job.progress

            if progress is not None:
                job.progress = max(0.0, min(1.0, progress))

            if progress_message is not None:
                job.progress_message = progress_message

            if error is not None:
                job.error = error

        Logger.instance().debug(
            f"Job {job_id} status updated to {status.value} (progress: {job.progress:.1%})"
        )

    def set_result(self, job_id: str, result: Dict[str, Any]):
        """
        Set job result (should be called when job completes successfully).

        Args:
            job_id: Job identifier
            result: Job result data
        """
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            if not job:
                Logger.instance().warning(f"Attempted to set result for non-existent job {job_id}")
                return

            job.result = result
            job.status = RunStatus.COMPLETED
            job.progress = 1.0
            job.progress_message = "Complete"
            if not job.completed_at:
                job.completed_at = datetime.now()

        Logger.instance().debug(f"Job {job_id} result set and marked as completed")

    def set_run_id(self, job_id: str, run_id: str) -> None:
        """
        Set the run_id for a job (semantic identifier for FilteredRunner).

        Args:
            job_id: Job identifier
            run_id: Semantic run ID (e.g., "query-temp_query_abc123")
        """
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            if job:
                job.run_id = run_id

    def cancel_job(self, job_id: str):
        """
        Cancel a job (if queued or running).

        Note: Actual job cancellation depends on executor implementation.
        This marks the job as cancelled but doesn't stop running threads.
        """
        self.update_status(job_id, RunStatus.CANCELLED, progress_message="Cancelled by user")

    def delete_job(self, job_id: str):
        """Remove job from tracking (cleanup)"""
        with self._jobs_lock:
            if job_id in self._jobs:
                del self._jobs[job_id]
                Logger.instance().debug(f"Deleted job {job_id}")

    def _cleanup_old_jobs(self):
        """Remove jobs older than max_job_age"""
        now = datetime.now()
        with self._jobs_lock:
            expired_jobs = [
                job_id
                for job_id, job in self._jobs.items()
                if (now - job.created_at) > self._max_job_age
            ]

            for job_id in expired_jobs:
                if job_id in self._jobs:
                    del self._jobs[job_id]
                    Logger.instance().debug(f"Cleaning up expired job {job_id}")

        if expired_jobs:
            Logger.instance().info(f"Cleaned up {len(expired_jobs)} expired model query jobs")

    def _start_cleanup_thread(self):
        """Start background thread for periodic cleanup"""

        def cleanup_loop():
            import time

            Logger.instance().info("Model query job cleanup thread started")
            while True:
                time.sleep(self._cleanup_interval)
                try:
                    self._cleanup_old_jobs()
                except Exception as e:
                    Logger.instance().error(f"Error in model query job cleanup: {e}")

        cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
        cleanup_thread.start()
        Logger.instance().info("Started model query job cleanup thread")
