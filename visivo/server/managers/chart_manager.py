from typing import Any, Dict, List, Optional

from pydantic import TypeAdapter, ValidationError

from visivo.logger.logger import Logger
from visivo.models.dag import all_descendants_of_type
from visivo.models.chart import Chart
from visivo.server.managers.object_manager import ObjectManager, ObjectStatus


class ChartManager(ObjectManager[Chart]):
    """
    Manages Chart objects with draft/published state tracking.

    Supports:
    - Immediate validation using Pydantic TypeAdapter(Chart)
    - Two-tier storage (cached/published) for edit-before-publish workflow
    """

    def __init__(self):
        super().__init__()
        self._chart_adapter = TypeAdapter(Chart)

    def validate_object(self, obj_data: dict) -> Chart:
        """
        Validate chart configuration using Pydantic.

        Args:
            obj_data: Dictionary containing chart configuration

        Returns:
            Validated Chart object

        Raises:
            ValidationError: If the chart configuration is invalid
        """
        return self._chart_adapter.validate_python(obj_data)

    def extract_from_dag(self, dag) -> None:
        """
        Extract Chart objects from a ProjectDag and populate published_objects.

        Args:
            dag: The ProjectDag to extract charts from
        """
        self._published_objects.clear()
        for chart in all_descendants_of_type(type=Chart, dag=dag):
            if chart.name:
                self._published_objects[chart.name] = chart

    def save_from_config(self, config: dict) -> Chart:
        """
        Validate and save chart from configuration dict.

        Args:
            config: Dictionary containing chart configuration

        Returns:
            The validated Chart object

        Raises:
            ValidationError: If the chart configuration is invalid
        """
        chart = self.validate_object(config)
        self.save(chart.name, chart)
        return chart

    def get_chart_with_status(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Get chart configuration with status information.

        Args:
            name: The name of the chart

        Returns:
            Dictionary with chart info and status, or None if not found
        """
        chart = self.get(name)
        if not chart:
            return None

        status = self.get_status(name)
        return self._serialize_object(name, chart, status)

    def get_all_charts_with_status(self) -> List[Dict[str, Any]]:
        """
        Get all charts (cached + published) with status info.

        Includes charts marked for deletion with DELETED status.

        Returns:
            List of dictionaries with chart info and status
        """
        result = []
        all_names = set(self._cached_objects.keys()) | set(self._published_objects.keys())

        for name in sorted(all_names):
            # Handle objects marked for deletion (None values in cache)
            if name in self._cached_objects and self._cached_objects[name] is None:
                # Include deleted objects with info from published version
                if name in self._published_objects:
                    chart = self._published_objects[name]
                    result.append(self._serialize_object(name, chart, ObjectStatus.DELETED))
                continue

            chart_info = self.get_chart_with_status(name)
            if chart_info:
                result.append(chart_info)

        return result

    def get_charts_list(self) -> List[Chart]:
        """
        Get charts as a list.

        Cached charts take priority over published.

        Returns:
            List of Chart objects
        """
        charts = []
        for chart in self.get_all_objects_list():
            # Skip None values (marked for deletion)
            if chart is not None:
                charts.append(chart)
        return charts

    def validate_config(self, config: dict) -> Dict[str, Any]:
        """
        Validate a chart configuration without saving it.

        Args:
            config: Dictionary containing chart configuration

        Returns:
            Dictionary with validation result
        """
        try:
            chart = self.validate_object(config)
            return {
                "valid": True,
                "name": chart.name,
            }
        except ValidationError as e:
            first_error = e.errors()[0]
            return {
                "valid": False,
                "error": f"Invalid chart configuration: {first_error['loc']}: {first_error['msg']}",
                "errors": e.errors(),
            }
        except Exception as e:
            Logger.instance().debug(f"Chart validation failed: {e}")
            return {"valid": False, "error": str(e)}
