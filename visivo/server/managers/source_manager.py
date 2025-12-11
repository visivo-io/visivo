from typing import Any, Dict, List, Optional

from pydantic import TypeAdapter, ValidationError

from visivo.logger.logger import Logger
from visivo.models.project import Project
from visivo.models.sources.fields import SourceField
from visivo.models.sources.source import Source
from visivo.server.managers.object_manager import ObjectManager, ObjectStatus
from visivo.server.source_metadata import _test_source_connection


class SourceManager(ObjectManager[Source]):
    """
    Manages Source objects with draft/published state tracking.

    Supports:
    - Immediate validation using Pydantic TypeAdapter(SourceField)
    - Connection testing on cached sources
    - Database/schema/table introspection on cached sources
    """

    def __init__(self):
        super().__init__()
        self._source_adapter = TypeAdapter(SourceField)

    def validate_object(self, obj_data: dict) -> Source:
        """
        Validate source configuration using Pydantic discriminated union.

        Args:
            obj_data: Dictionary containing source configuration

        Returns:
            Validated Source object

        Raises:
            ValidationError: If the source configuration is invalid
            ValueError: If validated object is not a Source instance
        """
        source = self._source_adapter.validate_python(obj_data)
        if not isinstance(source, Source):
            raise ValueError("Validated object is not a Source instance")
        return source

    def extract_from_project(self, project: Project) -> None:
        """
        Extract sources from a Project and populate published_objects.

        Args:
            project: The Project instance to extract sources from
        """
        self._published_objects.clear()
        for source in project.sources:
            if isinstance(source, Source) and source.name:
                self._published_objects[source.name] = source

    def save_from_config(self, config: dict) -> Source:
        """
        Validate and save source from configuration dict.

        Args:
            config: Dictionary containing source configuration

        Returns:
            The validated Source object

        Raises:
            ValidationError: If the source configuration is invalid
        """
        source = self.validate_object(config)
        self.save(source.name, source)
        return source

    def test_connection(self, name: str) -> Dict[str, Any]:
        """
        Test connection for a source by name.

        Works with both cached and published sources.

        Args:
            name: The name of the source to test

        Returns:
            Dictionary with connection test result
        """
        source = self.get(name)
        if not source:
            return {"source": name, "status": "not_found", "error": f"Source '{name}' not found"}

        return _test_source_connection(source, name)

    def get_source_with_status(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Get source configuration with status information.

        Args:
            name: The name of the source

        Returns:
            Dictionary with source info and status, or None if not found
        """
        source = self.get(name)
        if not source:
            return None

        status = self.get_status(name)
        return {
            "name": name,
            "status": status.value if status else None,
            "type": source.type if hasattr(source, "type") else None,
            "config": source.model_dump(exclude_none=True),
        }

    def get_all_sources_with_status(self) -> List[Dict[str, Any]]:
        """
        Get all sources (cached + published) with status info.

        Returns:
            List of dictionaries with source info and status
        """
        result = []
        all_names = set(self._cached_objects.keys()) | set(self._published_objects.keys())

        for name in sorted(all_names):
            # Skip objects marked for deletion (None values in cache)
            if name in self._cached_objects and self._cached_objects[name] is None:
                continue

            source_info = self.get_source_with_status(name)
            if source_info:
                result.append(source_info)

        return result

    def get_sources_list(self) -> List[Source]:
        """
        Get sources as a list (compatible with existing source_metadata functions).

        Cached sources take priority over published.

        Returns:
            List of Source objects
        """
        sources = []
        for source in self.get_all_objects_list():
            # Skip None values (marked for deletion)
            if source is not None:
                sources.append(source)
        return sources

    def validate_config(self, config: dict) -> Dict[str, Any]:
        """
        Validate a source configuration without saving it.

        Args:
            config: Dictionary containing source configuration

        Returns:
            Dictionary with validation result
        """
        try:
            source = self.validate_object(config)
            return {
                "valid": True,
                "name": source.name,
                "type": source.type if hasattr(source, "type") else None,
            }
        except ValidationError as e:
            first_error = e.errors()[0]
            return {
                "valid": False,
                "error": f"Invalid source configuration: {first_error['loc']}: {first_error['msg']}",
                "errors": e.errors(),
            }
        except Exception as e:
            Logger.instance().debug(f"Source validation failed: {e}")
            return {"valid": False, "error": str(e)}
