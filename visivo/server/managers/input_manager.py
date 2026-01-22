from typing import Any, Dict, List, Optional

from pydantic import TypeAdapter, ValidationError

from visivo.logger.logger import Logger
from visivo.models.dag import all_descendants_of_type
from visivo.models.inputs.input import Input
from visivo.models.inputs.fields import InputField
from visivo.server.managers.object_manager import ObjectManager, ObjectStatus


class InputManager(ObjectManager[Input]):
    """
    Manages Input objects with draft/published state tracking.

    Supports:
    - Immediate validation using Pydantic TypeAdapter(InputField)
    - Two-tier storage (cached/published) for edit-before-publish workflow
    """

    def __init__(self):
        super().__init__()
        self._input_adapter = TypeAdapter(InputField)

    def validate_object(self, obj_data: dict) -> Input:
        """
        Validate input configuration using Pydantic.

        Args:
            obj_data: Dictionary containing input configuration

        Returns:
            Validated Input object

        Raises:
            ValidationError: If the input configuration is invalid
        """
        return self._input_adapter.validate_python(obj_data)

    def extract_from_dag(self, dag) -> None:
        """
        Extract Input objects from a ProjectDag and populate published_objects.

        Args:
            dag: The ProjectDag to extract inputs from
        """
        self._published_objects.clear()
        for input_obj in all_descendants_of_type(type=Input, dag=dag):
            if input_obj.name:
                self._published_objects[input_obj.name] = input_obj

    def save_from_config(self, config: dict) -> Input:
        """
        Validate and save input from configuration dict.

        Args:
            config: Dictionary containing input configuration

        Returns:
            The validated Input object

        Raises:
            ValidationError: If the input configuration is invalid
        """
        input_obj = self.validate_object(config)
        self.save(input_obj.name, input_obj)
        return input_obj

    def get_input_with_status(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Get input configuration with status information.

        Args:
            name: The name of the input

        Returns:
            Dictionary with input info and status, or None if not found
        """
        input_obj = self.get(name)
        if not input_obj:
            return None

        status = self.get_status(name)
        return self._serialize_object(name, input_obj, status)

    def get_all_inputs_with_status(self) -> List[Dict[str, Any]]:
        """
        Get all inputs (cached + published) with status info.

        Includes inputs marked for deletion with DELETED status.

        Returns:
            List of dictionaries with input info and status
        """
        result = []
        all_names = set(self._cached_objects.keys()) | set(self._published_objects.keys())

        for name in sorted(all_names):
            # Handle objects marked for deletion (None values in cache)
            if name in self._cached_objects and self._cached_objects[name] is None:
                # Include deleted objects with info from published version
                if name in self._published_objects:
                    result.append(
                        self._serialize_object(
                            name, self._published_objects[name], ObjectStatus.DELETED
                        )
                    )
                continue

            input_obj = self.get(name)
            if input_obj:
                status = self.get_status(name)
                result.append(self._serialize_object(name, input_obj, status))

        return result

    def validate_config(self, config: dict) -> Dict[str, Any]:
        """
        Validate an input configuration without saving it.

        Args:
            config: Dictionary containing input configuration

        Returns:
            Dictionary with validation result
        """
        try:
            input_obj = self.validate_object(config)
            return {
                "valid": True,
                "name": input_obj.name,
            }
        except ValidationError as e:
            first_error = e.errors()[0]
            return {
                "valid": False,
                "error": f"Invalid input configuration: {first_error['loc']}: {first_error['msg']}",
                "errors": e.errors(),
            }
        except Exception as e:
            Logger.instance().debug(f"Input validation failed: {e}")
            return {"valid": False, "error": str(e)}

    def _serialize_object(
        self, name: str, input_obj: Input, status: ObjectStatus
    ) -> Dict[str, Any]:
        """
        Serialize an Input object to a dictionary with status.

        Args:
            name: The name of the input
            input_obj: The Input object to serialize
            status: The status of the input

        Returns:
            Dictionary with input configuration and metadata
        """
        return {
            "name": name,
            "config": input_obj.model_dump(mode="json", exclude_none=True, exclude={"path"}),
            "status": status.value,
        }
