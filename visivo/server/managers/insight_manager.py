from typing import Any, Dict, List, Optional

from pydantic import TypeAdapter, ValidationError

from visivo.logger.logger import Logger
from visivo.models.dag import all_descendants_of_type
from visivo.models.insight import Insight
from visivo.server.managers.object_manager import ObjectManager, ObjectStatus


class InsightManager(ObjectManager[Insight]):
    """
    Manages Insight objects with draft/published state tracking.

    Supports:
    - Immediate validation using Pydantic TypeAdapter(Insight)
    - Two-tier storage (cached/published) for edit-before-publish workflow
    """

    def __init__(self):
        super().__init__()
        self._insight_adapter = TypeAdapter(Insight)

    def validate_object(self, obj_data: dict) -> Insight:
        """
        Validate insight configuration using Pydantic.

        Args:
            obj_data: Dictionary containing insight configuration

        Returns:
            Validated Insight object

        Raises:
            ValidationError: If the insight configuration is invalid
        """
        return self._insight_adapter.validate_python(obj_data)

    def extract_from_dag(self, dag) -> None:
        """
        Extract Insight objects from a ProjectDag and populate published_objects.

        Args:
            dag: The ProjectDag to extract insights from
        """
        self._published_objects.clear()
        for insight in all_descendants_of_type(type=Insight, dag=dag):
            if insight.name:
                self._published_objects[insight.name] = insight

    def save_from_config(self, config: dict) -> Insight:
        """
        Validate and save insight from configuration dict.

        Args:
            config: Dictionary containing insight configuration

        Returns:
            The validated Insight object

        Raises:
            ValidationError: If the insight configuration is invalid
        """
        insight = self.validate_object(config)
        self.save(insight.name, insight)
        return insight

    def get_insight_with_status(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Get insight configuration with status information.

        Args:
            name: The name of the insight

        Returns:
            Dictionary with insight info and status, or None if not found
        """
        insight = self.get(name)
        if not insight:
            return None

        status = self.get_status(name)
        return self._serialize_object(name, insight, status)

    def get_all_insights_with_status(self) -> List[Dict[str, Any]]:
        """
        Get all insights (cached + published) with status info.

        Includes insights marked for deletion with DELETED status.

        Returns:
            List of dictionaries with insight info and status
        """
        result = []
        all_names = set(self._cached_objects.keys()) | set(self._published_objects.keys())

        for name in sorted(all_names):
            # Handle objects marked for deletion (None values in cache)
            if name in self._cached_objects and self._cached_objects[name] is None:
                # Include deleted objects with info from published version
                if name in self._published_objects:
                    insight = self._published_objects[name]
                    result.append(self._serialize_object(name, insight, ObjectStatus.DELETED))
                continue

            insight_info = self.get_insight_with_status(name)
            if insight_info:
                result.append(insight_info)

        return result

    def get_insights_list(self) -> List[Insight]:
        """
        Get insights as a list.

        Cached insights take priority over published.

        Returns:
            List of Insight objects
        """
        insights = []
        for insight in self.get_all_objects_list():
            # Skip None values (marked for deletion)
            if insight is not None:
                insights.append(insight)
        return insights

    def validate_config(self, config: dict) -> Dict[str, Any]:
        """
        Validate an insight configuration without saving it.

        Args:
            config: Dictionary containing insight configuration

        Returns:
            Dictionary with validation result
        """
        try:
            insight = self.validate_object(config)
            return {
                "valid": True,
                "name": insight.name,
            }
        except ValidationError as e:
            first_error = e.errors()[0]
            return {
                "valid": False,
                "error": f"Invalid insight configuration: {first_error['loc']}: {first_error['msg']}",
                "errors": e.errors(),
            }
        except Exception as e:
            Logger.instance().debug(f"Insight validation failed: {e}")
            return {"valid": False, "error": str(e)}
