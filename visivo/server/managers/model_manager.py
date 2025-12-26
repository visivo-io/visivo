from typing import Any, Dict, List, Optional

from pydantic import TypeAdapter, ValidationError

from visivo.logger.logger import Logger
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.sql_model import SqlModel
from visivo.server.managers.object_manager import ObjectManager, ObjectStatus


class ModelManager(ObjectManager[SqlModel]):
    """
    Manages SqlModel objects with draft/published state tracking.

    Supports:
    - Immediate validation using Pydantic TypeAdapter(SqlModel)
    - Two-tier storage (cached/published) for edit-before-publish workflow
    """

    def __init__(self):
        super().__init__()
        self._model_adapter = TypeAdapter(SqlModel)

    def validate_object(self, obj_data: dict) -> SqlModel:
        """
        Validate model configuration using Pydantic.

        Args:
            obj_data: Dictionary containing model configuration

        Returns:
            Validated SqlModel object

        Raises:
            ValidationError: If the model configuration is invalid
        """
        return self._model_adapter.validate_python(obj_data)

    def extract_from_dag(self, dag) -> None:
        """
        Extract SqlModel objects from a ProjectDag and populate published_objects.

        Only extracts SqlModel instances (not CsvScriptModel or LocalMergeModel).

        Args:
            dag: The ProjectDag to extract models from
        """
        self._published_objects.clear()
        for model in all_descendants_of_type(type=SqlModel, dag=dag):
            if model.name:
                self._published_objects[model.name] = model

    def save_from_config(self, config: dict) -> SqlModel:
        """
        Validate and save model from configuration dict.

        Args:
            config: Dictionary containing model configuration

        Returns:
            The validated SqlModel object

        Raises:
            ValidationError: If the model configuration is invalid
        """
        model = self.validate_object(config)
        self.save(model.name, model)
        return model

    def get_model_with_status(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Get model configuration with status information.

        Args:
            name: The name of the model

        Returns:
            Dictionary with model info and status, or None if not found
        """
        model = self.get(name)
        if not model:
            return None

        status = self.get_status(name)
        return self._serialize_object(name, model, status)

    def get_all_models_with_status(self) -> List[Dict[str, Any]]:
        """
        Get all models (cached + published) with status info.

        Includes models marked for deletion with DELETED status.

        Returns:
            List of dictionaries with model info and status
        """
        result = []
        all_names = set(self._cached_objects.keys()) | set(self._published_objects.keys())

        for name in sorted(all_names):
            # Handle objects marked for deletion (None values in cache)
            if name in self._cached_objects and self._cached_objects[name] is None:
                # Include deleted objects with info from published version
                if name in self._published_objects:
                    model = self._published_objects[name]
                    result.append(self._serialize_object(name, model, ObjectStatus.DELETED))
                continue

            model_info = self.get_model_with_status(name)
            if model_info:
                result.append(model_info)

        return result

    def get_models_list(self) -> List[SqlModel]:
        """
        Get models as a list.

        Cached models take priority over published.

        Returns:
            List of SqlModel objects
        """
        models = []
        for model in self.get_all_objects_list():
            # Skip None values (marked for deletion)
            if model is not None:
                models.append(model)
        return models

    def validate_config(self, config: dict) -> Dict[str, Any]:
        """
        Validate a model configuration without saving it.

        Args:
            config: Dictionary containing model configuration

        Returns:
            Dictionary with validation result
        """
        try:
            model = self.validate_object(config)
            return {
                "valid": True,
                "name": model.name,
            }
        except ValidationError as e:
            first_error = e.errors()[0]
            return {
                "valid": False,
                "error": f"Invalid model configuration: {first_error['loc']}: {first_error['msg']}",
                "errors": e.errors(),
            }
        except Exception as e:
            Logger.instance().debug(f"Model validation failed: {e}")
            return {"valid": False, "error": str(e)}
