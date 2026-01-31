"""
PreviewRunManager - Manages async preview run execution and lifecycle

Handles:
- Run creation and ID generation
- Run status tracking (queued, running, completed, failed)
- Result storage and retrieval
- Automatic cleanup of old runs

Note: These are "runs" not "jobs" because each run executes many jobs in a DAG.
"""

import hashlib
import json
import threading
import uuid
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, Optional

from visivo.logger.logger import Logger


class RunStatus(str, Enum):
    """Status of a preview run"""

    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class PreviewRun:
    """Represents a single preview run"""

    def __init__(self, run_id: str, config: Dict[str, Any], object_type: str):
        self.run_id = run_id
        self.config = config
        self.object_type = object_type
        self.config_hash = self._compute_config_hash(config)
        self.status = RunStatus.QUEUED
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
        config_str = json.dumps(config, sort_keys=True)
        return hashlib.sha256(config_str.encode()).hexdigest()

    def to_dict(self) -> Dict[str, Any]:
        """Serialize run to dictionary"""
        data = {
            "run_instance_id": self.run_id,
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

        if self.status == RunStatus.COMPLETED and self.result is not None:
            data["result"] = self.result

        return data


class PreviewRunManager:
    """
    Manages preview runs with automatic cleanup and thread-safe operations.

    Singleton pattern ensures single instance across Flask app.
    """

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super(PreviewRunManager, cls).__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        Logger.instance().info(
            f"PreviewRunManager.__init__ called, _initialized={getattr(self, '_initialized', 'NOT SET')}"
        )
        if getattr(self, "_initialized", False):
            Logger.instance().info("Already initialized, returning")
            return

        Logger.instance().info("Initializing PreviewRunManager")
        self._initialized = True
        self._runs: Dict[str, PreviewRun] = {}
        self._runs_lock = threading.Lock()
        Logger.instance().info("Created runs lock")
        self._cleanup_interval = 3600  # 1 hour in seconds
        self._max_run_age = timedelta(hours=2)  # Runs older than 2 hours are cleaned up
        self._start_cleanup_thread()
        Logger.instance().info("PreviewRunManager initialization complete")

    @classmethod
    def instance(cls) -> "PreviewRunManager":
        """Get singleton instance"""
        return cls()

    def find_existing_run(self, config: Dict[str, Any], object_type: str) -> Optional[str]:
        """
        Find an existing run with the same config that is queued or running.

        Args:
            config: Object configuration
            object_type: Type of object

        Returns:
            Run ID if found, None otherwise
        """
        Logger.instance().info("Computing config hash")
        config_hash = PreviewRun._compute_config_hash(config)

        Logger.instance().info("Attempting to acquire runs lock")
        with self._runs_lock:
            Logger.instance().info("Acquired runs lock, checking for existing runs")
            for run_id, run in self._runs.items():
                if (
                    run.object_type == object_type
                    and run.config_hash == config_hash
                    and run.status in (RunStatus.QUEUED, RunStatus.RUNNING)
                ):
                    Logger.instance().debug(
                        f"Found existing {run.status.value} run {run_id} with matching config"
                    )
                    return run_id

        return None

    def create_run(self, config: Dict[str, Any], object_type: str = "insight") -> str:
        """
        Create a new preview run, or return existing run if one with same config is running.

        Args:
            config: Object configuration to preview
            object_type: Type of object (insight, input, etc.)

        Returns:
            Run ID (UUID string)
        """
        existing_run_id = self.find_existing_run(config, object_type)
        if existing_run_id:
            Logger.instance().info(
                f"Reusing existing preview run {existing_run_id} for {object_type}"
            )
            return existing_run_id

        run_id = str(uuid.uuid4())
        run = PreviewRun(run_id, config, object_type)

        with self._runs_lock:
            self._runs[run_id] = run

        Logger.instance().debug(f"Created new preview run {run_id} for {object_type}")
        return run_id

    def get_run(self, run_id: str) -> Optional[PreviewRun]:
        """Get run by ID"""
        with self._runs_lock:
            return self._runs.get(run_id)

    def update_status(
        self,
        run_id: str,
        status: RunStatus,
        progress: Optional[float] = None,
        progress_message: Optional[str] = None,
        error: Optional[str] = None,
        error_details: Optional[Dict[str, Any]] = None,
    ):
        """
        Update run status and progress.

        Args:
            run_id: Run identifier
            status: New status
            progress: Progress percentage (0.0 to 1.0)
            progress_message: Human-readable progress message
            error: Error message if failed
            error_details: Detailed error information
        """
        with self._runs_lock:
            run = self._runs.get(run_id)
            if not run:
                Logger.instance().warning(f"Attempted to update non-existent run {run_id}")
                return

            run.status = status

            if status == RunStatus.RUNNING and not run.started_at:
                run.started_at = datetime.now()

            if status in (RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED):
                run.completed_at = datetime.now()
                run.progress = 1.0 if status == RunStatus.COMPLETED else run.progress

            if progress is not None:
                run.progress = max(0.0, min(1.0, progress))

            if progress_message is not None:
                run.progress_message = progress_message

            if error is not None:
                run.error = error

            if error_details is not None:
                run.error_details = error_details

        Logger.instance().debug(
            f"Run {run_id} status updated to {status.value} (progress: {run.progress:.1%})"
        )

    def set_result(self, run_id: str, result: Dict[str, Any]):
        """
        Set run result (should be called when run completes successfully).

        Args:
            run_id: Run identifier
            result: Run result data (insight metadata, etc.)
        """
        with self._runs_lock:
            run = self._runs.get(run_id)
            if not run:
                Logger.instance().warning(f"Attempted to set result for non-existent run {run_id}")
                return

            run.result = result
            # Update status directly without re-acquiring lock (to avoid deadlock)
            run.status = RunStatus.COMPLETED
            run.progress = 1.0
            run.progress_message = "Complete"
            if not run.completed_at:
                run.completed_at = datetime.now()

        Logger.instance().debug(f"Run {run_id} result set and marked as completed")

    def get_result(self, run_id: str) -> Optional[Dict[str, Any]]:
        """Get run result if completed"""
        run = self.get_run(run_id)
        if not run:
            return None

        if run.status != RunStatus.COMPLETED:
            return None

        return run.result

    def cancel_run(self, run_id: str):
        """
        Cancel a run (if queued or running).

        Note: Actual run cancellation depends on runner implementation.
        This marks the run as cancelled but doesn't stop running threads.
        """
        self.update_status(run_id, RunStatus.CANCELLED, progress_message="Cancelled by user")

    def delete_run(self, run_id: str):
        """Remove run from tracking (cleanup)"""
        with self._runs_lock:
            if run_id in self._runs:
                del self._runs[run_id]
                Logger.instance().debug(f"Deleted run {run_id}")

    def invalidate_completed_runs_for_insight(self, insight_name: str):
        """
        Remove any completed or failed runs for the given insight name.
        This forces a fresh execution when the insight config changes.
        """
        with self._runs_lock:
            runs_to_delete = [
                run_id
                for run_id, run in self._runs.items()
                if run.object_type == "insight"
                and run.config.get("name") == insight_name
                and run.status in (RunStatus.COMPLETED, RunStatus.FAILED)
            ]

            for run_id in runs_to_delete:
                del self._runs[run_id]
                Logger.instance().debug(
                    f"Invalidated completed run {run_id} for insight {insight_name}"
                )

            if runs_to_delete:
                Logger.instance().info(
                    f"Invalidated {len(runs_to_delete)} completed runs for insight {insight_name}"
                )

    def _cleanup_old_runs(self):
        """Remove runs older than max_run_age"""
        now = datetime.now()
        with self._runs_lock:
            expired_runs = [
                run_id
                for run_id, run in self._runs.items()
                if (now - run.created_at) > self._max_run_age
            ]

            # Delete expired runs while holding the lock (don't call delete_run to avoid deadlock)
            for run_id in expired_runs:
                if run_id in self._runs:
                    del self._runs[run_id]
                    Logger.instance().debug(f"Cleaning up expired run {run_id}")

        if expired_runs:
            Logger.instance().info(f"Cleaned up {len(expired_runs)} expired preview runs")

    def _start_cleanup_thread(self):
        """Start background thread for periodic cleanup"""

        def cleanup_loop():
            import time

            Logger.instance().info("Cleanup thread started, waiting for first interval")
            while True:
                time.sleep(self._cleanup_interval)
                Logger.instance().info("Cleanup thread woke up, attempting cleanup")
                try:
                    self._cleanup_old_runs()
                except Exception as e:
                    Logger.instance().error(f"Error in preview run cleanup: {e}")

        cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
        Logger.instance().info("Starting preview run cleanup thread")
        cleanup_thread.start()
        Logger.instance().info("Started preview run cleanup thread")
