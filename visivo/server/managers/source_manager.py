import os
from typing import Any, Dict, List, Optional

from pydantic import SecretStr, TypeAdapter, ValidationError

from visivo.logger.logger import Logger
from visivo.models.base.env_var_string import EnvVarString
from visivo.models.dag import all_descendants_of_type
from visivo.models.sources.fields import SourceField
from visivo.models.sources.source import Source
from visivo.server.managers.object_manager import ObjectManager, ObjectStatus
from visivo.server.source_credentials import (
    SECRET_MASK,
    ensure_env_gitignored,
    env_var_name,
    merge_env_file,
    read_env_file,
)
from visivo.server.source_metadata import _test_source_connection

# EnvVarString built directly skips validation; go through pydantic so a bad ref fails here.
_ENV_VAR_STRING_ADAPTER = TypeAdapter(EnvVarString)


class SourceManager(ObjectManager[Source]):
    """
    Manages Source objects with draft/published state tracking.

    Supports:
    - Immediate validation using Pydantic TypeAdapter(SourceField)
    - Connection testing on cached sources
    - Database/schema/table introspection on cached sources
    - Credential protection on save: secret fields never reach the project YAML
      as plaintext or as Pydantic's "**********" mask
    """

    def __init__(self, project_dir: Optional[str] = None):
        super().__init__()
        self._source_adapter = TypeAdapter(SourceField)
        # Where externalized credentials are written (<project_dir>/.env); cwd when None.
        self.project_dir = project_dir

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

    def extract_from_dag(self, dag) -> None:
        """
        Extract sources from a ProjectDag and populate published_objects.

        Finds all sources in the DAG.

        Args:
            dag: The ProjectDag to extract sources from
        """
        self._published_objects.clear()
        for source in all_descendants_of_type(type=Source, dag=dag):
            if source.name:
                self._published_objects[source.name] = source

    def save(self, name: str, obj: Source) -> None:
        """Every draft write (API, rename, agent) lands here, so none can stage a
        plaintext or masked secret."""
        super().save(name, self._protect_secrets(obj))

    def save_from_config(self, config: dict) -> Source:
        """
        Validate and save source from configuration dict.

        Args:
            config: Dictionary containing source configuration

        Returns:
            The cached Source object, with secrets protected

        Raises:
            ValidationError: If the source configuration is invalid
        """
        source = self.validate_object(config)
        self.save(source.name, source)
        return self.cached_objects[source.name]

    @staticmethod
    def _secret_field_names(source: Source) -> List[str]:
        """Fields currently holding a plaintext SecretStr (``${env.*}`` refs are EnvVarString)."""
        return [
            field_name
            for field_name in type(source).model_fields
            if isinstance(getattr(source, field_name, None), SecretStr)
        ]

    def _protect_secrets(self, source: Source) -> Source:
        """Return ``source`` with no secret a commit could write into YAML.

        A commit dumps with ``model_dump(mode="json")``, which renders a plaintext
        SecretStr as the ``**********`` mask. Per secret field:

        1. The mask (the API's echo, round-tripped) keeps whatever is stored under
           this name; with nothing stored it is dropped.
        2. An empty value is dropped.
        3. Remaining plaintext moves to ``.env`` behind a ``${env.<SOURCE>_<FIELD>}``
           ref, unless the source equals its published form (a no-op save leaves
           the YAML untouched).
        """
        # get() answers None for a source marked for deletion; its credential is still published.
        existing = self.get(source.name) or self._published_objects.get(source.name)
        updates: Dict[str, Any] = {}

        for field_name in self._secret_field_names(source):
            raw = getattr(source, field_name).get_secret_value()
            if not raw:
                updates[field_name] = None
                continue
            if raw == SECRET_MASK:
                prior = getattr(existing, field_name, None) if existing is not None else None
                if isinstance(prior, SecretStr) and prior.get_secret_value() == SECRET_MASK:
                    # A project already corrupted by the mask bug: externalizing it would hide that.
                    Logger.instance().warn(
                        f"Source '{source.name}': stored secret '{field_name}' is the "
                        f"'{SECRET_MASK}' placeholder, not a credential — dropping it. "
                        "Re-enter the value to restore this source."
                    )
                    prior = None
                elif prior is None:
                    Logger.instance().warn(
                        f"Source '{source.name}': dropping masked secret field "
                        f"'{field_name}' — nothing is stored under that name to "
                        "preserve. Re-enter the value to restore this source."
                    )
                updates[field_name] = prior

        if updates:
            source = source.model_copy(update=updates)

        remaining = self._secret_field_names(source)
        if not remaining:
            return source

        published = self._published_objects.get(source.name)
        if published is not None and self.objects_equal(source, published):
            return source

        stored_env = read_env_file(self.project_dir)
        owned = self._env_var_names_referenced_by(source.name, existing, published)

        env_values: Dict[str, str] = {}
        ref_updates: Dict[str, Any] = {}
        for field_name in remaining:
            secret = getattr(source, field_name).get_secret_value()
            var_name = self._allocate_env_var_name(
                source.name, field_name, secret, stored_env, owned
            )
            stored_env[var_name] = secret
            env_values[var_name] = secret
            ref_updates[field_name] = _ENV_VAR_STRING_ADAPTER.validate_python(
                f"${{env.{var_name}}}"
            )

        ensure_env_gitignored(self.project_dir)
        merge_env_file(self.project_dir, env_values)
        # So the new refs resolve in this running server.
        os.environ.update(env_values)
        return source.model_copy(update=ref_updates)

    @staticmethod
    def _env_var_names_referenced_by(name: str, *sources) -> set:
        """The ``${env.*}`` names this source already points at — keys it may overwrite."""
        owned = set()
        for candidate in sources:
            if candidate is None or getattr(candidate, "name", None) != name:
                continue
            for field_name in type(candidate).model_fields:
                value = getattr(candidate, field_name, None)
                if isinstance(value, EnvVarString):
                    owned.update(value.get_env_var_names())
        return owned

    def _allocate_env_var_name(
        self,
        source_name: str,
        field_name: str,
        secret: str,
        stored_env: Dict[str, str],
        owned: set,
    ) -> str:
        """An .env key for this secret that cannot clobber another source's.

        ``analytics-db`` and ``analytics_db`` both map to ``ANALYTICS_DB_PASSWORD``;
        a key holding a different value this source does not own gets a ``_N`` suffix.
        """
        base = env_var_name(source_name, field_name)
        for attempt in range(1, 101):
            candidate = base if attempt == 1 else f"{base}_{attempt}"
            current = stored_env.get(candidate)
            if candidate in owned or current is None or current == secret:
                if candidate != base:
                    Logger.instance().warn(
                        f"Source '{source_name}': environment variable '{base}' is already "
                        f"used by another credential — storing '{field_name}' as "
                        f"'{candidate}' instead."
                    )
                return candidate
        raise ValueError(  # pragma: no cover - defensive
            f"Could not find a free environment variable name for '{base}'"
        )

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

        return _test_source_connection(source, name, self.project_dir)

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
        return self._serialize_object(name, source, status)

    def get_all_sources_with_status(self) -> List[Dict[str, Any]]:
        """
        Get all sources (cached + published) with status info.

        Includes sources marked for deletion with DELETED status.

        Returns:
            List of dictionaries with source info and status
        """
        result = []
        all_names = set(self._cached_objects.keys()) | set(self._published_objects.keys())

        for name in sorted(all_names):
            # Handle objects marked for deletion (None values in cache)
            if name in self._cached_objects and self._cached_objects[name] is None:
                # Include deleted objects with info from published version
                if name in self._published_objects:
                    source = self._published_objects[name]
                    result.append(self._serialize_object(name, source, ObjectStatus.DELETED))
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

    # --- Granular introspection methods (delegate to source methods) ---

    def get_databases(self, source_name: str) -> Dict[str, Any]:
        """
        Get list of databases for a source.

        Args:
            source_name: The name of the source

        Returns:
            Dictionary with database list or error
        """
        source = self.get(source_name)
        if source is None:
            return {"error": f"Source '{source_name}' not found", "status": "not_found"}
        try:
            databases = source.list_databases()
            return {
                "source": source_name,
                "databases": [{"name": db} for db in databases],
                "status": "connected",
            }
        except Exception as e:
            return {"source": source_name, "error": str(e), "status": "connection_failed"}

    def get_schemas(self, source_name: str, database_name: str) -> Dict[str, Any]:
        """
        Get list of schemas for a database in a source.

        Args:
            source_name: The name of the source
            database_name: The database to get schemas from

        Returns:
            Dictionary with schema list or error
        """
        source = self.get(source_name)
        if source is None:
            return {"error": f"Source '{source_name}' not found", "status": "not_found"}
        try:
            schemas = source.get_schemas(database_name)
            return {
                "source": source_name,
                "database": database_name,
                "schemas": [{"name": s} for s in schemas],
                "status": "connected",
            }
        except Exception as e:
            return {"error": str(e), "status": "connection_failed"}

    def get_tables(
        self, source_name: str, database_name: str, schema_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get list of tables and views for a source.

        Args:
            source_name: The name of the source
            database_name: The database to get tables from
            schema_name: Optional schema to filter by

        Returns:
            Dictionary with table list or error
        """
        source = self.get(source_name)
        if source is None:
            return {"error": f"Source '{source_name}' not found", "status": "not_found"}
        try:
            tables = source.get_tables(database_name, schema_name)
            return {
                "source": source_name,
                "database": database_name,
                "schema": schema_name,
                "tables": tables,
                "status": "connected",
            }
        except Exception as e:
            return {"error": str(e), "status": "connection_failed"}

    def get_columns(
        self,
        source_name: str,
        database_name: str,
        table_name: str,
        schema_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Get list of columns for a table in a source.

        Args:
            source_name: The name of the source
            database_name: The database containing the table
            table_name: The table to get columns from
            schema_name: Optional schema the table belongs to

        Returns:
            Dictionary with column list or error
        """
        source = self.get(source_name)
        if source is None:
            return {"error": f"Source '{source_name}' not found", "status": "not_found"}
        try:
            columns = source.get_columns(database_name, table_name, schema_name)
            return {
                "source": source_name,
                "database": database_name,
                "table": table_name,
                "schema": schema_name,
                "columns": columns,
                "status": "connected",
            }
        except Exception as e:
            return {"error": str(e), "status": "connection_failed"}

    def get_table_preview(
        self,
        source_name: str,
        database_name: str,
        table_name: str,
        schema_name: Optional[str] = None,
        limit: int = 100,
    ) -> Dict[str, Any]:
        """
        Get preview rows from a table in a source.

        Args:
            source_name: The name of the source
            database_name: The database containing the table
            table_name: The table to preview
            schema_name: Optional schema the table belongs to
            limit: Maximum number of rows to return (clamped to 1-1000)

        Returns:
            Dictionary with preview data or error
        """
        source = self.get(source_name)
        if source is None:
            return {"error": f"Source '{source_name}' not found", "status": "not_found"}
        try:
            result = source.get_table_preview(database_name, table_name, schema_name, limit)
            result["status"] = "connected"
            return result
        except Exception as e:
            return {"error": str(e), "status": "connection_failed"}
