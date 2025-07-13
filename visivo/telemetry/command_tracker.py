"""
Command execution tracking and metrics collection.
"""

from typing import Optional, Dict, Any
from visivo.telemetry import get_telemetry_context, get_telemetry_client
from visivo.telemetry.collector import collect_project_metrics, count_filtered_jobs
from visivo.telemetry.utils import hash_project_name
from visivo.telemetry.config import is_telemetry_enabled
from visivo.telemetry.machine_id import get_machine_id
from visivo.telemetry.events import NewInstallationEvent


def track_compile_metrics(project):
    """
    Collect and track telemetry metrics during compile phase.

    Args:
        project: The project being compiled
    """
    try:
        # Check if this is the first run and send new installation event
        _check_new_installation()

        # Store hashed project name
        if project and hasattr(project, "name"):
            project_hash = hash_project_name(project.name)
            if project_hash:
                get_telemetry_context().set("project_hash", project_hash)

        # Collect object counts
        object_counts = collect_project_metrics(project)
        if object_counts:  # Only store if we successfully collected metrics
            get_telemetry_context().set("object_counts", object_counts)
    except Exception:
        # Silently ignore any telemetry errors
        pass


def track_run_metrics(project, dag_filter):
    """
    Collect and track telemetry metrics during run phase.

    Args:
        project: The project being run
        dag_filter: The DAG filter being applied
    """
    try:
        # Check if this is the first run and send new installation event
        _check_new_installation()

        # Store hashed project name
        if project and hasattr(project, "name"):
            project_hash = hash_project_name(project.name)
            if project_hash:
                get_telemetry_context().set("project_hash", project_hash)

        # Count jobs
        job_count = count_filtered_jobs(project.dag(), dag_filter)
        if job_count > 0:  # Only store if we successfully counted
            get_telemetry_context().set("job_count", job_count)
    except Exception:
        # Silently ignore any telemetry errors
        pass


def _check_new_installation():
    """
    Check if this is a new installation and send the new installation event.

    This is called from compile/run phases to ensure we catch new installations
    regardless of which command is run first.
    """
    # This will trigger the new installation event if it's a new machine ID
    # The event is sent from within get_machine_id() when creating a new ID
    get_machine_id()
