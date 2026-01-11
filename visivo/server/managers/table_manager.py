from typing import Any, Dict, List, Optional

from pydantic import TypeAdapter, ValidationError

from visivo.logger.logger import Logger
from visivo.models.dag import all_descendants_of_type
from visivo.models.table import Table
from visivo.server.managers.object_manager import ObjectManager, ObjectStatus


class TableManager(ObjectManager[Table]):
    """
    Manages Table objects with draft/published state tracking.

    Supports:
    - Immediate validation using Pydantic TypeAdapter(Table)
    - Two-tier storage (cached/published) for edit-before-publish workflow
    """

    def __init__(self):
        super().__init__()
        self._table_adapter = TypeAdapter(Table)

    def validate_object(self, obj_data: dict) -> Table:
        """
        Validate table configuration using Pydantic.

        Args:
            obj_data: Dictionary containing table configuration

        Returns:
            Validated Table object

        Raises:
            ValidationError: If the table configuration is invalid
        """
        return self._table_adapter.validate_python(obj_data)

    def extract_from_dag(self, dag) -> None:
        """
        Extract Table objects from a ProjectDag and populate published_objects.

        Args:
            dag: The ProjectDag to extract tables from
        """
        self._published_objects.clear()
        for table in all_descendants_of_type(type=Table, dag=dag):
            if table.name:
                self._published_objects[table.name] = table

    def save_from_config(self, config: dict) -> Table:
        """
        Validate and save table from configuration dict.

        Args:
            config: Dictionary containing table configuration

        Returns:
            The validated Table object

        Raises:
            ValidationError: If the table configuration is invalid
        """
        table = self.validate_object(config)
        self.save(table.name, table)
        return table

    def get_table_with_status(self, name: str) -> Optional[Dict[str, Any]]:
        """
        Get table configuration with status information.

        Args:
            name: The name of the table

        Returns:
            Dictionary with table info and status, or None if not found
        """
        table = self.get(name)
        if not table:
            return None

        status = self.get_status(name)
        return self._serialize_object(name, table, status)

    def get_all_tables_with_status(self) -> List[Dict[str, Any]]:
        """
        Get all tables (cached + published) with status info.

        Includes tables marked for deletion with DELETED status.

        Returns:
            List of dictionaries with table info and status
        """
        result = []
        all_names = set(self._cached_objects.keys()) | set(self._published_objects.keys())

        for name in sorted(all_names):
            # Handle objects marked for deletion (None values in cache)
            if name in self._cached_objects and self._cached_objects[name] is None:
                # Include deleted objects with info from published version
                if name in self._published_objects:
                    table = self._published_objects[name]
                    result.append(self._serialize_object(name, table, ObjectStatus.DELETED))
                continue

            table_info = self.get_table_with_status(name)
            if table_info:
                result.append(table_info)

        return result

    def get_tables_list(self) -> List[Table]:
        """
        Get tables as a list.

        Cached tables take priority over published.

        Returns:
            List of Table objects
        """
        tables = []
        for table in self.get_all_objects_list():
            # Skip None values (marked for deletion)
            if table is not None:
                tables.append(table)
        return tables

    def validate_config(self, config: dict) -> Dict[str, Any]:
        """
        Validate a table configuration without saving it.

        Args:
            config: Dictionary containing table configuration

        Returns:
            Dictionary with validation result
        """
        try:
            table = self.validate_object(config)
            return {
                "valid": True,
                "name": table.name,
            }
        except ValidationError as e:
            first_error = e.errors()[0]
            return {
                "valid": False,
                "error": f"Invalid table configuration: {first_error['loc']}: {first_error['msg']}",
                "errors": e.errors(),
            }
        except Exception as e:
            Logger.instance().debug(f"Table validation failed: {e}")
            return {"valid": False, "error": str(e)}
