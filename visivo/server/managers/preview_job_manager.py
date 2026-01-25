"""
PreviewJobManager - Manages async preview job execution and lifecycle

Handles:
- Job creation and ID generation
- Job status tracking (queued, running, completed, failed)
- Result storage and retrieval
- Automatic cleanup of old jobs
"""

import hashlib
import json
import threading
import uuid
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, Optional

from visivo.logger.logger import Logger


class JobStatus(str, Enum):
    """Status of a preview job"""

    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PreviewJob:
    """Represents a single preview job"""

    def __init__(self, job_id: str, config: Dict[str, Any], object_type: str):
        self.job_id = job_id
        self.config = config
        self.object_type = object_type
        self.config_hash = self._compute_config_hash(config)
        self.status = JobStatus.QUEUED
        self.created_at = datetime.now()
        self.started_at: Optional[datetime] = None
        self.completed_at: Optional[datetime] = None
        self.progress: float = 0.0  # 0.0 to 1.0
        self.progress_message: str = "Queued"
        self.result: Optional[Dict[str, Any]] = None
        self.error: Optional[str] = None
        self.error_details: Optional[Dict[str, Any]] = None

    @staticmethod
    def _compute_config_hash(config: Dict[str, Any]) -> str:
        """Compute a stable hash of the config for deduplication"""
        # Sort keys to ensure consistent ordering
        config_str = json.dumps(config, sort_keys=True)
        return hashlib.sha256(config_str.encode()).hexdigest()

    def to_dict(self) -> Dict[str, Any]:
        """Serialize job to dictionary"""
        data = {
            "job_id": self.job_id,
            "object_type": self.object_type,
            "status": self.status.value,
            "created_at": self.created_at.isoformat(),
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "progress": self.progress,
            "progress_message": self.progress_message,
            "error": self.error,
            "error_details": self.error_details,
        }

        # Include result if job is completed
        if self.status == JobStatus.COMPLETED and self.result is not None:
            data["result"] = self.result

        return data


class PreviewJobManager:
    """
    Manages preview jobs with automatic cleanup and thread-safe operations.

    Singleton pattern ensures single instance across Flask app.
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(PreviewJobManager, cls).__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._initialized = True
        self._jobs: Dict[str, PreviewJob] = {}
        self._jobs_lock = threading.Lock()
        self._cleanup_interval = 3600  # 1 hour in seconds
        self._max_job_age = timedelta(hours=2)  # Jobs older than 2 hours are cleaned up
        self._start_cleanup_thread()

    @classmethod
    def instance(cls) -> "PreviewJobManager":
        """Get singleton instance"""
        return cls()

    def find_existing_job(self, config: Dict[str, Any], object_type: str) -> Optional[str]:
        """
        Find an existing job with the same config that is queued or running.

        Args:
            config: Object configuration
            object_type: Type of object

        Returns:
            Job ID if found, None otherwise
        """
        config_hash = PreviewJob._compute_config_hash(config)

        with self._jobs_lock:
            for job_id, job in self._jobs.items():
                if (
                    job.object_type == object_type
                    and job.config_hash == config_hash
                    and job.status in (JobStatus.QUEUED, JobStatus.RUNNING)
                ):
                    Logger.instance().debug(
                        f"Found existing {job.status.value} job {job_id} with matching config"
                    )
                    return job_id

        return None

    def create_job(self, config: Dict[str, Any], object_type: str = "insight") -> str:
        """
        Create a new preview job, or return existing job if one with same config is running.

        Args:
            config: Object configuration to preview
            object_type: Type of object (insight, input, etc.)

        Returns:
            Job ID (UUID string)
        """
        # Check for existing job with same config
        existing_job_id = self.find_existing_job(config, object_type)
        if existing_job_id:
            Logger.instance().info(
                f"Reusing existing preview job {existing_job_id} for {object_type}"
            )
            return existing_job_id

        # Create new job
        job_id = str(uuid.uuid4())
        job = PreviewJob(job_id, config, object_type)

        with self._jobs_lock:
            self._jobs[job_id] = job

        Logger.instance().debug(f"Created new preview job {job_id} for {object_type}")
        return job_id

    def get_job(self, job_id: str) -> Optional[PreviewJob]:
        """Get job by ID"""
        with self._jobs_lock:
            return self._jobs.get(job_id)

    def update_status(
        self,
        job_id: str,
        status: JobStatus,
        progress: Optional[float] = None,
        progress_message: Optional[str] = None,
        error: Optional[str] = None,
        error_details: Optional[Dict[str, Any]] = None,
    ):
        """
        Update job status and progress.

        Args:
            job_id: Job identifier
            status: New status
            progress: Progress percentage (0.0 to 1.0)
            progress_message: Human-readable progress message
            error: Error message if failed
            error_details: Detailed error information
        """
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            if not job:
                Logger.instance().warning(f"Attempted to update non-existent job {job_id}")
                return

            job.status = status

            if status == JobStatus.RUNNING and not job.started_at:
                job.started_at = datetime.now()

            if status in (JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED):
                job.completed_at = datetime.now()
                job.progress = 1.0 if status == JobStatus.COMPLETED else job.progress

            if progress is not None:
                job.progress = max(0.0, min(1.0, progress))

            if progress_message is not None:
                job.progress_message = progress_message

            if error is not None:
                job.error = error

            if error_details is not None:
                job.error_details = error_details

        Logger.instance().debug(
            f"Job {job_id} status updated to {status.value} (progress: {job.progress:.1%})"
        )

    def set_result(self, job_id: str, result: Dict[str, Any]):
        """
        Set job result (should be called when job completes successfully).

        Args:
            job_id: Job identifier
            result: Job result data (insight metadata, etc.)
        """
        with self._jobs_lock:
            job = self._jobs.get(job_id)
            if not job:
                Logger.instance().warning(f"Attempted to set result for non-existent job {job_id}")
                return

            job.result = result
            self.update_status(
                job_id, JobStatus.COMPLETED, progress=1.0, progress_message="Complete"
            )

    def get_result(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Get job result if completed"""
        job = self.get_job(job_id)
        if not job:
            return None

        if job.status != JobStatus.COMPLETED:
            return None

        return job.result

    def cancel_job(self, job_id: str):
        """
        Cancel a job (if queued or running).

        Note: Actual job cancellation depends on runner implementation.
        This marks the job as cancelled but doesn't stop running threads.
        """
        self.update_status(job_id, JobStatus.CANCELLED, progress_message="Cancelled by user")

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
            Logger.instance().debug(f"Cleaning up expired job {job_id}")
            self.delete_job(job_id)

        if expired_jobs:
            Logger.instance().info(f"Cleaned up {len(expired_jobs)} expired preview jobs")

    def _start_cleanup_thread(self):
        """Start background thread for periodic cleanup"""

        def cleanup_loop():
            import time

            while True:
                time.sleep(self._cleanup_interval)
                try:
                    self._cleanup_old_jobs()
                except Exception as e:
                    Logger.instance().error(f"Error in preview job cleanup: {e}")

        cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
        cleanup_thread.start()
        Logger.instance().info("Started preview job cleanup thread")
