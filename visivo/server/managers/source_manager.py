import os
from typing import Any, Dict, List, Optional

from pydantic import SecretStr, TypeAdapter, ValidationError

from visivo.logger.logger import Logger
from visivo.models.base.env_var_string import EnvVarString
from visivo.models.dag import all_descendants_of_type
from visivo.models.sources.fields import SourceField
from visivo.models.sources.source import Source
from visivo.server.managers.object_manager import ObjectManager, ObjectStatus
from visivo.server.source_credentials import SECRET_MASK, env_var_name, merge_env_file
from visivo.server.source_metadata import _test_source_connection


class SourceManager(ObjectManager[Source]):
    """
    Manages Source objects with draft/published state tracking.

    Supports:
    - Immediate validation using Pydantic TypeAdapter(SourceField)
    - Connection testing on cached sources
    - Database/schema/table introspection on cached sources
    - Credential protection on save: secret-typed fields never reach the
      project YAML as plaintext or as Pydantic's "**********" mask
    """

    def __init__(self, project_dir: Optional[str] = None):
        super().__init__()
        self._source_adapter = TypeAdapter(SourceField)
        # Where the project's .env lives (the serve working dir). Falls back
        # to the process cwd inside merge_env_file when None, matching the
        # CLI's own --working-dir default.
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

    def save_from_config(self, config: dict) -> Source:
        """
        Validate and save source from configuration dict.

        Secret-typed fields (Pydantic SecretStr — password, private key
        passphrases, tokens) are protected before the source is cached, so
        that neither a plaintext secret nor the API's "**********" mask can
        later be written into the project YAML by a commit. See
        ``_protect_secrets`` for the exact rules.

        Args:
            config: Dictionary containing source configuration

        Returns:
            The validated Source object

        Raises:
            ValidationError: If the source configuration is invalid
        """
        source = self.validate_object(config)
        source = self._protect_secrets(source)
        self.save(source.name, source)
        return source

    def _secret_field_names(self, source: Source) -> List[str]:
        """Names of fields on this source instance currently holding a
        plaintext SecretStr.

        Detected from the live values rather than a hardcoded field list, so
        every SecretStrOrEnvVar field on every source type is covered
        (ServerSource.password, SnowflakeSource.private_key_passphrase,
        BigQuerySource.credentials_base64, and any future ones). Fields
        already holding a ${env.*} reference validate to EnvVarString, not
        SecretStr, so they are naturally excluded.
        """
        return [
            field_name
            for field_name in type(source).model_fields
            if isinstance(getattr(source, field_name, None), SecretStr)
        ]

    def _protect_secrets(self, source: Source) -> Source:
        """Keep secrets out of the YAML that a later commit will write.

        The commit path serializes the cached object with
        ``model_dump(mode="json")``, which renders any plaintext SecretStr as
        the literal ``**********`` mask — silently destroying the credential.
        So the cached object must never hold a plaintext SecretStr that could
        be committed. Rules, per secret-typed field:

        1. Incoming value == the mask (the API's echo of a stored secret,
           round-tripped by the frontend): preserve the stored value —
           an existing ``${env.*}`` reference is kept verbatim, an existing
           literal keeps its real value. A mask with nothing stored behind it
           is dropped, never written.
        2. Empty string: dropped (mirrors the onboarding path).
        3. Any plaintext that would be committed (the source differs from its
           published form) is externalized: the real value goes to the
           project's .env (merged) and os.environ, and the field becomes a
           ``${env.<SOURCE>_<FIELD>}`` reference — the same naming convention
           the onboarding path uses. A plaintext literal on a source that is
           byte-identical to its published YAML form is left alone, so a
           no-op save never rewrites the project file.
        """
        existing = self.get(source.name)
        updates: Dict[str, Any] = {}

        for field_name in self._secret_field_names(source):
            raw = getattr(source, field_name).get_secret_value()
            if not raw:
                # An empty credential must not survive to YAML — drop it.
                updates[field_name] = None
                continue
            if raw == SECRET_MASK:
                prior = getattr(existing, field_name, None) if existing is not None else None
                if prior is not None:
                    # Preserve whatever is stored — env-var ref or literal.
                    updates[field_name] = prior
                else:
                    # A mask with no stored secret behind it (e.g. a config
                    # copied from another source's masked API response) —
                    # there is nothing real to store, and the mask itself
                    # must never be written.
                    Logger.instance().info(
                        f"Source '{source.name}': dropping masked secret field "
                        f"'{field_name}' with no previously stored value."
                    )
                    updates[field_name] = None

        if updates:
            source = source.model_copy(update=updates)

        remaining = self._secret_field_names(source)
        if not remaining:
            return source

        # Plaintext secrets remain (new/changed values, or preserved literals).
        # If the source is identical to its published YAML form, no commit will
        # rewrite it — leave the literal exactly where it already is. Otherwise
        # a commit WILL re-serialize this object into YAML, so every plaintext
        # secret must move to .env with a ${env.*} reference in its place.
        published = self._published_objects.get(source.name)
        if published is not None and self.objects_equal(source, published):
            return source

        env_values: Dict[str, str] = {}
        ref_updates: Dict[str, Any] = {}
        for field_name in remaining:
            var_name = env_var_name(source.name, field_name)
            env_values[var_name] = getattr(source, field_name).get_secret_value()
            ref_updates[field_name] = EnvVarString(f"${{env.{var_name}}}")

        merge_env_file(self.project_dir, env_values)
        # Load into the running server so the refs resolve immediately,
        # matching the onboarding path (VIS-1216).
        os.environ.update(env_values)
        return source.model_copy(update=ref_updates)

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
