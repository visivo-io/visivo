"""
Schema extraction module for gathering source schemas during compile phase.

This module provides efficient schema extraction with memory-based caching
to avoid redundant database queries during compilation.
"""

import re
from typing import Dict, Optional, Set, Any
from visivo.logger.logger import Logger
from visivo.models.models.sql_model import SqlModel
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel


class SchemaExtractor:
    """Extracts and caches source schemas during the compile phase."""

    def __init__(self, project):
        """Initialize the schema extractor with a project.

        Args:
            project: The Visivo project object containing sources and models.
        """
        self.project = project
        self._schema_cache: Dict[str, Dict[str, str]] = {}
        self._source_map: Dict[str, Any] = self._build_source_map()
        self.logger = Logger.instance()

    def _build_source_map(self) -> Dict[str, Any]:
        """Build a map of source names to source objects for quick lookup."""
        source_map = {}
        if hasattr(self.project, "sources") and self.project.sources:
            for source in self.project.sources:
                source_map[source.name] = source
        return source_map

    def extract_all_schemas(self) -> Dict[str, Dict[str, Dict[str, str]]]:
        """Extract schemas for all sources used by models in the project.

        Returns:
            Dictionary mapping source names to model names to column schemas.
            Example: {
                'source1': {
                    'model1': {'col1': 'INTEGER', 'col2': 'VARCHAR'},
                    'model2': {'col1': 'DECIMAL', 'col3': 'TIMESTAMP'}
                },
                'source2': {
                    'model3': {'id': 'INTEGER', 'name': 'TEXT'}
                }
            }
        """
        schemas = {}
        used_sources = self._get_used_sources()

        for source_name in used_sources:
            if source_name not in self._source_map:
                self.logger.debug(f"Source '{source_name}' not found in project sources")
                continue

            source = self._source_map[source_name]
            model_schemas = self._extract_source_schemas(source)
            if model_schemas:
                schemas[source_name] = model_schemas

        return schemas

    def _get_used_sources(self) -> Set[str]:
        """Get the set of source names that are actually used by models.

        Returns:
            Set of source names that are referenced by at least one model.
        """
        used_sources = set()

        if not hasattr(self.project, "models") or not self.project.models:
            return used_sources

        for model in self.project.models:
            # SQL models have a source field
            if isinstance(model, SqlModel):
                if model.source:
                    # Handle ref() or direct source name
                    source_name = self._extract_source_name(model.source)
                    if source_name:
                        used_sources.add(source_name)
                else:
                    # If no source specified, check for default source
                    if hasattr(self.project, "defaults") and self.project.defaults:
                        if hasattr(self.project.defaults, "source_name"):
                            default_source = self.project.defaults.source_name
                            if default_source:
                                used_sources.add(default_source)

        return used_sources

    def _extract_source_name(self, source_ref) -> Optional[str]:
        """Extract the source name from a source reference.

        Args:
            source_ref: Either a string source name or a source object.

        Returns:
            The source name if found, None otherwise.
        """
        if isinstance(source_ref, str):
            # Handle ref() syntax
            if source_ref.startswith("ref(") and source_ref.endswith(")"):
                name = source_ref[4:-1].strip()
                # Validate name contains only safe characters
                if not re.match(r"^[a-zA-Z0-9_]+$", name):
                    self.logger.warning(f"Invalid source name format: {name}")
                    return None
                return name
            # Validate direct source reference
            if re.match(r"^[a-zA-Z0-9_]+$", source_ref):
                return source_ref
            self.logger.warning(f"Invalid source reference format: {source_ref}")
            return None
        elif hasattr(source_ref, "name"):
            return source_ref.name
        return None

    def _extract_source_schemas(self, source) -> Dict[str, Dict[str, str]]:
        """Extract schemas for all models using a given source.

        Args:
            source: The source object to extract schemas from.

        Returns:
            Dictionary mapping model names to their column schemas.
        """
        model_schemas = {}

        if not hasattr(self.project, "models") or not self.project.models:
            return model_schemas

        for model in self.project.models:
            # Only process SQL models that use this source
            if not isinstance(model, SqlModel):
                continue

            model_source_name = self._get_model_source_name(model)
            if model_source_name != source.name:
                continue

            # Check cache first
            cache_key = f"{source.name}:{model.name}"
            if cache_key in self._schema_cache:
                model_schemas[model.name] = self._schema_cache[cache_key]
                self.logger.debug(f"Using cached schema for model '{model.name}'")
                continue

            # Extract schema for this model
            try:
                schema = self._extract_model_schema(source, model)
                if schema:
                    model_schemas[model.name] = schema
                    self._schema_cache[cache_key] = schema
                    self.logger.debug(
                        f"Extracted schema for model '{model.name}': {len(schema)} columns"
                    )
            except Exception as e:
                self.logger.debug(f"Failed to extract schema for model '{model.name}': {str(e)}")

        return model_schemas

    def _get_model_source_name(self, model: SqlModel) -> Optional[str]:
        """Get the source name for a given model.

        Args:
            model: The SQL model to get the source for.

        Returns:
            The source name if found, None otherwise.
        """
        if model.source:
            return self._extract_source_name(model.source)
        elif hasattr(self.project, "defaults") and self.project.defaults:
            if hasattr(self.project.defaults, "source_name"):
                return self.project.defaults.source_name
        return None

    def _extract_model_schema(self, source, model: SqlModel) -> Optional[Dict[str, str]]:
        """Extract the schema for a specific model from a source.

        Uses the source's get_model_schema() method with LRU caching.

        Args:
            source: The source object with a get_model_schema method.
            model: The SQL model to extract schema for.

        Returns:
            Dictionary mapping column names to data types, or None if extraction fails.
        """
        # Use existing cache instead of lru_cache (can't use with mutable objects)
        cache_key = f"{source.name}:{model.name if model.name else 'unnamed'}"
        if cache_key in self._schema_cache:
            return self._schema_cache[cache_key]

        try:
            # Use the source's get_model_schema method
            if hasattr(source, "get_model_schema"):
                schema = source.get_model_schema(model_sql=model.sql)
                self._schema_cache[cache_key] = schema
                return schema
        except ConnectionError as e:
            self.logger.error(f"Connection failed for source '{source.name}': {str(e)}")
            # Don't cache connection errors
        except Exception as e:
            self.logger.debug(
                f"Schema extraction failed for model '{model.name}' on source '{source.name}': {str(e)}"
            )
            # Cache None for other failures to avoid retrying
            self._schema_cache[cache_key] = None
        return None

    def get_schema_for_model(
        self, model_name: str, source_name: str = None
    ) -> Optional[Dict[str, str]]:
        """Get the cached schema for a specific model.

        Args:
            model_name: Name of the model.
            source_name: Optional source name. If not provided, will search all sources.

        Returns:
            Dictionary mapping column names to data types, or None if not found.
        """
        if source_name:
            cache_key = f"{source_name}:{model_name}"
            return self._schema_cache.get(cache_key)

        # Search all cached schemas
        for key, schema in self._schema_cache.items():
            if key.endswith(f":{model_name}"):
                return schema
        return None
