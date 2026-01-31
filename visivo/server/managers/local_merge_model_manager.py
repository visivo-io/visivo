from typing import Any, Dict, List, Optional

from pydantic import TypeAdapter, ValidationError

from visivo.logger.logger import Logger
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.server.managers.object_manager import ObjectManager, ObjectStatus


class LocalMergeModelManager(ObjectManager[LocalMergeModel]):
    """
    Manages LocalMergeModel objects with draft/published state tracking.
    """

    def __init__(self):
        super().__init__()
        self._adapter = TypeAdapter(LocalMergeModel)

    def validate_object(self, obj_data: dict) -> LocalMergeModel:
        return self._adapter.validate_python(obj_data)

    def extract_from_dag(self, dag) -> None:
        self._published_objects.clear()
        for model in all_descendants_of_type(type=LocalMergeModel, dag=dag):
            if model.name:
                self._published_objects[model.name] = model

    def save_from_config(self, config: dict) -> LocalMergeModel:
        model = self.validate_object(config)
        self.save(model.name, model)
        return model

    def get_with_status(self, name: str) -> Optional[Dict[str, Any]]:
        model = self.get(name)
        if not model:
            return None

        status = self.get_status(name)
        return self._serialize_object(name, model, status)

    def get_all_with_status(self) -> List[Dict[str, Any]]:
        result = []
        all_names = set(self._cached_objects.keys()) | set(self._published_objects.keys())

        for name in sorted(all_names):
            if name in self._cached_objects and self._cached_objects[name] is None:
                if name in self._published_objects:
                    model = self._published_objects[name]
                    result.append(self._serialize_object(name, model, ObjectStatus.DELETED))
                continue

            info = self.get_with_status(name)
            if info:
                result.append(info)

        return result

    def validate_config(self, config: dict) -> Dict[str, Any]:
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
                "error": f"Invalid LocalMergeModel configuration: {first_error['loc']}: {first_error['msg']}",
                "errors": e.errors(),
            }
        except Exception as e:
            Logger.instance().debug(f"LocalMergeModel validation failed: {e}")
            return {"valid": False, "error": str(e)}
