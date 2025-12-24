from typing import Any, Dict, List, Optional

from pydantic import TypeAdapter, ValidationError

from visivo.logger.logger import Logger
from visivo.models.metric import Metric
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.server.managers.object_manager import ObjectManager, ObjectStatus


class MetricManager(ObjectManager[Metric]):
    """
    Manages Metric objects with draft/published state tracking.

    Supports:
    - Project-level metrics (global)
    - Model-scoped metrics (nested within SqlModels)
    - Two-tier storage (cached/published) for edit-before-publish workflow
    """

    def __init__(self):
        super().__init__()
        self._metric_adapter = TypeAdapter(Metric)

    def validate_object(self, obj_data: dict) -> Metric:
        """
        Validate metric configuration using Pydantic.

        Args:
            obj_data: Dictionary containing metric configuration

        Returns:
            Validated Metric object

        Raises:
            ValidationError: If the metric configuration is invalid
        """
        return self._metric_adapter.validate_python(obj_data)

    def extract_from_project(self, project: Project) -> None:
        """
        Extract Metric objects from a Project and populate published_objects.

        Extracts both project-level metrics and model-scoped metrics.

        Args:
            project: The Project instance to extract metrics from
        """
        self._published_objects.clear()

        # Extract project-level metrics
        for metric in project.metrics:
            if isinstance(metric, Metric) and metric.name:
                self._published_objects[metric.name] = metric

        # Extract model-scoped metrics
        for model in project.models:
            if isinstance(model, SqlModel):
                for metric in model.metrics:
                    if isinstance(metric, Metric) and metric.name:
                        self._published_objects[metric.name] = metric

    def save_from_config(self, config: dict) -> Metric:
        """
        Validate and save metric from configuration dict.

        Args:
            config: Dictionary containing metric configuration

        Returns:
            The validated Metric object

        Raises:
            ValidationError: If the metric configuration is invalid
        """
        metric = self.validate_object(config)
        self.save(metric.name, metric)
        return metric

    def get_metric_with_status(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Get metric configuration with status information.

        Args:
            name: The name of the metric

        Returns:
            Dictionary with metric info and status, or None if not found
        """
        metric = self.get(name)
        if not metric:
            return None

        status = self.get_status(name)
        return self._serialize_object(name, metric, status)

    def get_all_metrics_with_status(self) -> List[Dict[str, Any]]:
        """
        Get all metrics (cached + published) with status info.

        Includes metrics marked for deletion with DELETED status.

        Returns:
            List of dictionaries with metric info and status
        """
        result = []
        all_names = set(self._cached_objects.keys()) | set(self._published_objects.keys())

        for name in sorted(all_names):
            # Handle objects marked for deletion (None values in cache)
            if name in self._cached_objects and self._cached_objects[name] is None:
                # Include deleted objects with info from published version
                if name in self._published_objects:
                    metric = self._published_objects[name]
                    result.append(self._serialize_object(name, metric, ObjectStatus.DELETED))
                continue

            metric_info = self.get_metric_with_status(name)
            if metric_info:
                result.append(metric_info)

        return result

    def get_metrics_list(self) -> List[Metric]:
        """
        Get metrics as a list.

        Cached metrics take priority over published.

        Returns:
            List of Metric objects
        """
        metrics = []
        for metric in self.get_all_objects_list():
            # Skip None values (marked for deletion)
            if metric is not None:
                metrics.append(metric)
        return metrics

    def validate_config(self, config: dict) -> Dict[str, Any]:
        """
        Validate a metric configuration without saving it.

        Args:
            config: Dictionary containing metric configuration

        Returns:
            Dictionary with validation result
        """
        try:
            metric = self.validate_object(config)
            return {
                "valid": True,
                "name": metric.name,
            }
        except ValidationError as e:
            first_error = e.errors()[0]
            return {
                "valid": False,
                "error": f"Invalid metric configuration: {first_error['loc']}: {first_error['msg']}",
                "errors": e.errors(),
            }
        except Exception as e:
            Logger.instance().debug(f"Metric validation failed: {e}")
            return {"valid": False, "error": str(e)}
