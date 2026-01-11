from typing import Any, Dict, List, Optional

from pydantic import TypeAdapter, ValidationError

from visivo.logger.logger import Logger
from visivo.models.dag import all_descendants_of_type
from visivo.models.markdown import Markdown
from visivo.server.managers.object_manager import ObjectManager, ObjectStatus


class MarkdownManager(ObjectManager[Markdown]):
    """
    Manages Markdown objects with draft/published state tracking.

    Supports:
    - Immediate validation using Pydantic TypeAdapter(Markdown)
    - Two-tier storage (cached/published) for edit-before-publish workflow
    """

    def __init__(self):
        super().__init__()
        self._markdown_adapter = TypeAdapter(Markdown)

    def validate_object(self, obj_data: dict) -> Markdown:
        """
        Validate markdown configuration using Pydantic.

        Args:
            obj_data: Dictionary containing markdown configuration

        Returns:
            Validated Markdown object

        Raises:
            ValidationError: If the markdown configuration is invalid
        """
        return self._markdown_adapter.validate_python(obj_data)

    def extract_from_dag(self, dag) -> None:
        """
        Extract Markdown objects from a ProjectDag and populate published_objects.

        Args:
            dag: The ProjectDag to extract markdowns from
        """
        self._published_objects.clear()
        for markdown in all_descendants_of_type(type=Markdown, dag=dag):
            if markdown.name:
                self._published_objects[markdown.name] = markdown

    def save_from_config(self, config: dict) -> Markdown:
        """
        Validate and save markdown from configuration dict.

        Args:
            config: Dictionary containing markdown configuration

        Returns:
            The validated Markdown object

        Raises:
            ValidationError: If the markdown configuration is invalid
        """
        markdown = self.validate_object(config)
        self.save(markdown.name, markdown)
        return markdown

    def get_markdown_with_status(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Get markdown configuration with status information.

        Args:
            name: The name of the markdown

        Returns:
            Dictionary with markdown info and status, or None if not found
        """
        markdown = self.get(name)
        if not markdown:
            return None

        status = self.get_status(name)
        return self._serialize_object(name, markdown, status)

    def get_all_markdowns_with_status(self) -> List[Dict[str, Any]]:
        """
        Get all markdowns (cached + published) with status info.

        Includes markdowns marked for deletion with DELETED status.

        Returns:
            List of dictionaries with markdown info and status
        """
        result = []
        all_names = set(self._cached_objects.keys()) | set(self._published_objects.keys())

        for name in sorted(all_names):
            # Handle objects marked for deletion (None values in cache)
            if name in self._cached_objects and self._cached_objects[name] is None:
                # Include deleted objects with info from published version
                if name in self._published_objects:
                    markdown = self._published_objects[name]
                    result.append(self._serialize_object(name, markdown, ObjectStatus.DELETED))
                continue

            markdown_info = self.get_markdown_with_status(name)
            if markdown_info:
                result.append(markdown_info)

        return result

    def get_markdowns_list(self) -> List[Markdown]:
        """
        Get markdowns as a list.

        Cached markdowns take priority over published.

        Returns:
            List of Markdown objects
        """
        markdowns = []
        for markdown in self.get_all_objects_list():
            # Skip None values (marked for deletion)
            if markdown is not None:
                markdowns.append(markdown)
        return markdowns

    def validate_config(self, config: dict) -> Dict[str, Any]:
        """
        Validate a markdown configuration without saving it.

        Args:
            config: Dictionary containing markdown configuration

        Returns:
            Dictionary with validation result
        """
        try:
            markdown = self.validate_object(config)
            return {
                "valid": True,
                "name": markdown.name,
            }
        except ValidationError as e:
            first_error = e.errors()[0]
            return {
                "valid": False,
                "error": f"Invalid markdown configuration: {first_error['loc']}: {first_error['msg']}",
                "errors": e.errors(),
            }
        except Exception as e:
            Logger.instance().debug(f"Markdown validation failed: {e}")
            return {"valid": False, "error": str(e)}
