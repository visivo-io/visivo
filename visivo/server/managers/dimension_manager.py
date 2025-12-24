from typing import Any, Dict, List, Optional

from pydantic import TypeAdapter, ValidationError

from visivo.logger.logger import Logger
from visivo.models.dimension import Dimension
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.server.managers.object_manager import ObjectManager, ObjectStatus


class DimensionManager(ObjectManager[Dimension]):
    """
    Manages Dimension objects with draft/published state tracking.

    Supports:
    - Project-level dimensions (global)
    - Model-scoped dimensions (nested within SqlModels)
    - Two-tier storage (cached/published) for edit-before-publish workflow
    """

    def __init__(self):
        super().__init__()
        self._dimension_adapter = TypeAdapter(Dimension)

    def validate_object(self, obj_data: dict) -> Dimension:
        """
        Validate dimension configuration using Pydantic.

        Args:
            obj_data: Dictionary containing dimension configuration

        Returns:
            Validated Dimension object

        Raises:
            ValidationError: If the dimension configuration is invalid
        """
        return self._dimension_adapter.validate_python(obj_data)

    def extract_from_project(self, project: Project) -> None:
        """
        Extract Dimension objects from a Project and populate published_objects.

        Extracts both project-level dimensions and model-scoped dimensions.

        Args:
            project: The Project instance to extract dimensions from
        """
        self._published_objects.clear()

        # Extract project-level dimensions
        for dimension in project.dimensions:
            if isinstance(dimension, Dimension) and dimension.name:
                self._published_objects[dimension.name] = dimension

        # Extract model-scoped dimensions
        for model in project.models:
            if isinstance(model, SqlModel):
                for dimension in model.dimensions:
                    if isinstance(dimension, Dimension) and dimension.name:
                        self._published_objects[dimension.name] = dimension

    def save_from_config(self, config: dict) -> Dimension:
        """
        Validate and save dimension from configuration dict.

        Args:
            config: Dictionary containing dimension configuration

        Returns:
            The validated Dimension object

        Raises:
            ValidationError: If the dimension configuration is invalid
        """
        dimension = self.validate_object(config)
        self.save(dimension.name, dimension)
        return dimension

    def get_dimension_with_status(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Get dimension configuration with status information.

        Args:
            name: The name of the dimension

        Returns:
            Dictionary with dimension info and status, or None if not found
        """
        dimension = self.get(name)
        if not dimension:
            return None

        status = self.get_status(name)
        return self._serialize_object(name, dimension, status)

    def get_all_dimensions_with_status(self) -> List[Dict[str, Any]]:
        """
        Get all dimensions (cached + published) with status info.

        Includes dimensions marked for deletion with DELETED status.

        Returns:
            List of dictionaries with dimension info and status
        """
        result = []
        all_names = set(self._cached_objects.keys()) | set(self._published_objects.keys())

        for name in sorted(all_names):
            # Handle objects marked for deletion (None values in cache)
            if name in self._cached_objects and self._cached_objects[name] is None:
                # Include deleted objects with info from published version
                if name in self._published_objects:
                    dimension = self._published_objects[name]
                    result.append(self._serialize_object(name, dimension, ObjectStatus.DELETED))
                continue

            dimension_info = self.get_dimension_with_status(name)
            if dimension_info:
                result.append(dimension_info)

        return result

    def get_dimensions_list(self) -> List[Dimension]:
        """
        Get dimensions as a list.

        Cached dimensions take priority over published.

        Returns:
            List of Dimension objects
        """
        dimensions = []
        for dimension in self.get_all_objects_list():
            # Skip None values (marked for deletion)
            if dimension is not None:
                dimensions.append(dimension)
        return dimensions

    def validate_config(self, config: dict) -> Dict[str, Any]:
        """
        Validate a dimension configuration without saving it.

        Args:
            config: Dictionary containing dimension configuration

        Returns:
            Dictionary with validation result
        """
        try:
            dimension = self.validate_object(config)
            return {
                "valid": True,
                "name": dimension.name,
            }
        except ValidationError as e:
            first_error = e.errors()[0]
            return {
                "valid": False,
                "error": f"Invalid dimension configuration: {first_error['loc']}: {first_error['msg']}",
                "errors": e.errors(),
            }
        except Exception as e:
            Logger.instance().debug(f"Dimension validation failed: {e}")
            return {"valid": False, "error": str(e)}
