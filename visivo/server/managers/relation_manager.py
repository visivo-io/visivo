from typing import Any, Dict, List, Optional

from pydantic import TypeAdapter, ValidationError

from visivo.logger.logger import Logger
from visivo.models.dag import all_descendants_of_type
from visivo.models.relation import Relation
from visivo.server.managers.object_manager import ObjectManager, ObjectStatus


class RelationManager(ObjectManager[Relation]):
    """
    Manages Relation objects with draft/published state tracking.

    Relations define how models can be joined together. They are project-level
    objects that reference two or more models.

    Supports:
    - Two-tier storage (cached/published) for edit-before-publish workflow
    """

    def __init__(self):
        super().__init__()
        self._relation_adapter = TypeAdapter(Relation)

    def validate_object(self, obj_data: dict) -> Relation:
        """
        Validate relation configuration using Pydantic.

        Args:
            obj_data: Dictionary containing relation configuration

        Returns:
            Validated Relation object

        Raises:
            ValidationError: If the relation configuration is invalid
        """
        return self._relation_adapter.validate_python(obj_data)

    def extract_from_dag(self, dag) -> None:
        """
        Extract Relation objects from a ProjectDag and populate published_objects.

        Args:
            dag: The ProjectDag to extract relations from
        """
        self._published_objects.clear()
        for relation in all_descendants_of_type(type=Relation, dag=dag):
            if relation.name:
                self._published_objects[relation.name] = relation

    def save_from_config(self, config: dict) -> Relation:
        """
        Validate and save relation from configuration dict.

        Args:
            config: Dictionary containing relation configuration

        Returns:
            The validated Relation object

        Raises:
            ValidationError: If the relation configuration is invalid
        """
        relation = self.validate_object(config)
        self.save(relation.name, relation)
        return relation

    def get_relation_with_status(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Get relation configuration with status information.

        Args:
            name: The name of the relation

        Returns:
            Dictionary with relation info and status, or None if not found
        """
        relation = self.get(name)
        if not relation:
            return None

        status = self.get_status(name)
        return self._serialize_object(name, relation, status)

    def get_all_relations_with_status(self) -> List[Dict[str, Any]]:
        """
        Get all relations (cached + published) with status info.

        Includes relations marked for deletion with DELETED status.

        Returns:
            List of dictionaries with relation info and status
        """
        result = []
        all_names = set(self._cached_objects.keys()) | set(self._published_objects.keys())

        for name in sorted(all_names):
            # Handle objects marked for deletion (None values in cache)
            if name in self._cached_objects and self._cached_objects[name] is None:
                # Include deleted objects with info from published version
                if name in self._published_objects:
                    relation = self._published_objects[name]
                    result.append(self._serialize_object(name, relation, ObjectStatus.DELETED))
                continue

            relation_info = self.get_relation_with_status(name)
            if relation_info:
                result.append(relation_info)

        return result

    def get_relations_list(self) -> List[Relation]:
        """
        Get relations as a list.

        Cached relations take priority over published.

        Returns:
            List of Relation objects
        """
        relations = []
        for relation in self.get_all_objects_list():
            # Skip None values (marked for deletion)
            if relation is not None:
                relations.append(relation)
        return relations

    def validate_config(self, config: dict) -> Dict[str, Any]:
        """
        Validate a relation configuration without saving it.

        Args:
            config: Dictionary containing relation configuration

        Returns:
            Dictionary with validation result
        """
        try:
            relation = self.validate_object(config)
            return {
                "valid": True,
                "name": relation.name,
            }
        except ValidationError as e:
            first_error = e.errors()[0]
            return {
                "valid": False,
                "error": f"Invalid relation configuration: {first_error['loc']}: {first_error['msg']}",
                "errors": e.errors(),
            }
        except Exception as e:
            Logger.instance().debug(f"Relation validation failed: {e}")
            return {"valid": False, "error": str(e)}
