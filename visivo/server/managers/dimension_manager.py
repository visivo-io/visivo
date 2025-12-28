from typing import Any, Dict, List, Optional

from pydantic import TypeAdapter, ValidationError

from visivo.logger.logger import Logger
from visivo.models.dag import all_descendants_of_type
from visivo.models.dimension import Dimension
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

    def extract_from_dag(self, dag) -> None:
        """
        Extract Dimension objects from a ProjectDag and populate published_objects.

        Finds all dimensions (project-level and model-scoped) in the DAG.

        Args:
            dag: The ProjectDag to extract dimensions from
        """
        self._published_objects.clear()
        for dimension in all_descendants_of_type(type=Dimension, dag=dag):
            if dimension.name:
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
        result = self._serialize_object(name, dimension, status)

        # Include parent model if this is a nested dimension
        if hasattr(dimension, "_parent_name") and dimension._parent_name:
            result["parentModel"] = dimension._parent_name

        return result

    def get_all_dimensions_with_status(
        self, cached_models: List = None, model_statuses: Dict[str, ObjectStatus] = None
    ) -> List[Dict[str, Any]]:
        """
        Get all dimensions (cached + published) with status info.

        Includes dimensions marked for deletion with DELETED status.
        If cached_models is provided, also includes model-scoped dimensions from those models.

        Args:
            cached_models: Optional list of cached SqlModel objects to extract model-scoped dimensions from
            model_statuses: Optional dict mapping model names to their ObjectStatus

        Returns:
            List of dictionaries with dimension info and status
        """
        result = []
        seen_names = set()
        all_names = set(self._cached_objects.keys()) | set(self._published_objects.keys())

        for name in sorted(all_names):
            # Handle objects marked for deletion (None values in cache)
            if name in self._cached_objects and self._cached_objects[name] is None:
                # Include deleted objects with info from published version
                if name in self._published_objects:
                    dimension = self._published_objects[name]
                    deleted_info = self._serialize_object(name, dimension, ObjectStatus.DELETED)
                    # Include parent model if this is a nested dimension
                    if hasattr(dimension, "_parent_name") and dimension._parent_name:
                        deleted_info["parentModel"] = dimension._parent_name
                    result.append(deleted_info)
                seen_names.add(name)
                continue

            dimension_info = self.get_dimension_with_status(name)
            if dimension_info:
                result.append(dimension_info)
                seen_names.add(name)

        # Include model-scoped dimensions from cached models
        if cached_models:
            for model in cached_models:
                if model is None:
                    continue
                model_name = model.name if hasattr(model, "name") else None
                if not model_name:
                    continue

                # Get the model's status for the dimensions
                model_status = (
                    model_statuses.get(model_name, ObjectStatus.MODIFIED)
                    if model_statuses
                    else ObjectStatus.MODIFIED
                )

                for dimension in model.dimensions:
                    if isinstance(dimension, Dimension) and dimension.name:
                        if dimension.name not in seen_names:
                            dimension_info = self._serialize_object(
                                dimension.name, dimension, model_status
                            )
                            dimension_info["parentModel"] = model_name
                            result.append(dimension_info)
                            seen_names.add(dimension.name)

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
