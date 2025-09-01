"""
Lightweight metric collection utilities for Visivo telemetry.
"""

from typing import Dict, Optional
from visivo.models.project import Project


def collect_project_metrics(project: Project) -> Dict[str, int]:
    """
    Collect high-level metrics from a project.

    This function is designed to be very fast and only collects
    counts of top-level objects without any expensive operations.

    Args:
        project: The Visivo project to collect metrics from

    Returns:
        Dictionary of object type to count
    """
    return {
        "sources": len(project.sources) if project.sources else 0,
        "models": len(project.models) if project.models else 0,
        "traces": len(project.traces) if project.traces else 0,
        "tables": len(project.tables) if project.tables else 0,
        "insights": len(project.insights) if project.insights else 0,
        "charts": len(project.charts) if project.charts else 0,
        "dashboards": len(project.dashboards) if project.dashboards else 0,
        "alerts": len(project.alerts) if project.alerts else 0,
        "inputs": len(project.inputs) if project.inputs else 0,
        "selectors": len(project.selectors) if project.selectors else 0,
        "destinations": len(project.destinations) if project.destinations else 0,
    }


def count_filtered_jobs(project_dag, dag_filter: str) -> int:
    """
    Count the number of jobs that will be run based on the DAG filter.

    This is a lightweight operation that just counts the filtered DAGs
    without executing them.

    Args:
        project_dag: The project DAG object
        dag_filter: The filter string for selecting jobs

    Returns:
        Number of jobs that match the filter
    """
    try:
        # The filter_dag method returns an iterator of job DAGs
        # We just count them without materializing the full list
        return sum(1 for _ in project_dag.filter_dag(dag_filter))
    except Exception:
        # If anything goes wrong, return -1 to indicate error
        return -1
