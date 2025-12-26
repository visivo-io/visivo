from typing import Any, Dict, List, Optional

from pydantic import TypeAdapter, ValidationError

from visivo.logger.logger import Logger
from visivo.models.dag import all_descendants_of_type
from visivo.models.metric import Metric
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

    def extract_from_dag(self, dag) -> None:
        """
        Extract Metric objects from a ProjectDag and populate published_objects.

        Finds all metrics (project-level and model-scoped) in the DAG.

        Args:
            dag: The ProjectDag to extract metrics from
        """
        self._published_objects.clear()
        for metric in all_descendants_of_type(type=Metric, dag=dag):
            if metric.name:
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
        result = self._serialize_object(name, metric, status)

        # Include parent model if this is a nested metric
        if hasattr(metric, "_parent_name") and metric._parent_name:
            result["parentModel"] = metric._parent_name

        return result

    def get_all_metrics_with_status(
        self, cached_models: List = None, model_statuses: Dict[str, ObjectStatus] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all metrics (cached + published) with status info.

        Includes metrics marked for deletion with DELETED status.
        If cached_models is provided, also includes model-scoped metrics from those models.

        Args:
            cached_models: Optional list of cached SqlModel objects to extract model-scoped metrics from
            model_statuses: Optional dict mapping model names to their ObjectStatus

        Returns:
            List of dictionaries with metric info and status
        """
        result = []
        seen_names = set()
        all_names = set(self._cached_objects.keys()) | set(self._published_objects.keys())

        for name in sorted(all_names):
            # Handle objects marked for deletion (None values in cache)
            if name in self._cached_objects and self._cached_objects[name] is None:
                # Include deleted objects with info from published version
                if name in self._published_objects:
                    metric = self._published_objects[name]
                    deleted_info = self._serialize_object(name, metric, ObjectStatus.DELETED)
                    # Include parent model if this is a nested metric
                    if hasattr(metric, "_parent_name") and metric._parent_name:
                        deleted_info["parentModel"] = metric._parent_name
                    result.append(deleted_info)
                seen_names.add(name)
                continue

            metric_info = self.get_metric_with_status(name)
            if metric_info:
                result.append(metric_info)
                seen_names.add(name)

        # Include model-scoped metrics from cached models
        if cached_models:
            for model in cached_models:
                if model is None:
                    continue
                model_name = model.name if hasattr(model, "name") else None
                if not model_name:
                    continue

                # Get the model's status for the metrics
                model_status = (
                    model_statuses.get(model_name, ObjectStatus.MODIFIED)
                    if model_statuses
                    else ObjectStatus.MODIFIED
                )

                for metric in model.metrics:
                    if isinstance(metric, Metric) and metric.name:
                        if metric.name not in seen_names:
                            metric_info = self._serialize_object(metric.name, metric, model_status)
                            metric_info["parentModel"] = model_name
                            result.append(metric_info)
                            seen_names.add(metric.name)

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
