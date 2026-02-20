"""
Source schema caching for efficient DAG execution.

Caches CachedMappingSchemaProvider instances per source to avoid
redundant schema loading and DataType building across model jobs.
"""

from threading import Lock
from typing import Dict, Optional

from visivo.logger.logger import Logger
from visivo.query.cached_mapping_schema import CachedMappingSchemaProvider
from visivo.query.schema_aggregator import SchemaAggregator
from visivo.query.sqlglot_utils import get_sqlglot_dialect
from visivo.constants import DEFAULT_RUN_ID


class SourceSchemaCache:
    """
    Caches built schemas per source - instantiated at DAG runner level.

    This class ensures that schema loading and DataType building happens
    ONCE per source per run, rather than once per model job. For a run
    with 20 models using the same source with 919 tables (15,995 columns):

    Before: 20 × JSON loads + 20 × 15,995 DataType.build() = 319,900 builds
    After: 1 × JSON load + 1 × 15,995 DataType.build() = 15,995 builds

    Thread-safe: Uses a lock to prevent race conditions when multiple
    model jobs request the same provider concurrently.

    Usage:
        cache = SourceSchemaCache()
        provider = cache.get_provider("my_source", "/output", "run_id")
        schema = provider.get_filtered_schema({"orders", "customers"})
    """

    def __init__(self):
        """Initialize empty cache with thread lock."""
        self._providers: Dict[str, CachedMappingSchemaProvider] = {}
        self._lock = Lock()

    def get_provider(
        self,
        source_name: str,
        source_type: str,
        output_dir: str,
        run_id: str = DEFAULT_RUN_ID,
    ) -> Optional[CachedMappingSchemaProvider]:
        """
        Get cached schema provider for a source.

        Creates the provider on first access, returns cached instance thereafter.
        Thread-safe: Uses a lock to prevent race conditions when multiple
        model jobs request the same provider concurrently.

        Args:
            source_name: Name of the source
            source_type: Type of the source (e.g., "snowflake", "postgresql")
            output_dir: Output directory where schemas are stored
            run_id: Run ID for schema storage location

        Returns:
            CachedMappingSchemaProvider or None if no schema exists
        """
        cache_key = f"{source_name}:{run_id}"

        # Fast path: check cache without lock
        if cache_key in self._providers:
            Logger.instance().debug(f"Using cached schema provider for {source_name}")
            return self._providers[cache_key]

        # Slow path: acquire lock and build provider
        with self._lock:
            # Double-check after acquiring lock (another thread may have built it)
            if cache_key in self._providers:
                Logger.instance().debug(f"Using cached schema provider for {source_name}")
                return self._providers[cache_key]

            # Load schema from disk and build provider
            stored_schema = SchemaAggregator.load_source_schema(
                source_name=source_name, output_dir=output_dir, run_id=run_id
            )

            if stored_schema is None:
                Logger.instance().debug(f"No stored schema found for source {source_name}")
                return None

            # Get dialect for proper type parsing
            try:
                dialect = get_sqlglot_dialect(source_type) if source_type else None
            except NotImplementedError:
                dialect = None

            # Build and cache the provider
            Logger.instance().debug(f"Building schema provider for {source_name}")
            provider = CachedMappingSchemaProvider(stored_schema, dialect=dialect)

            self._providers[cache_key] = provider

            Logger.instance().debug(
                f"Cached schema for {source_name}: "
                f"{provider.table_count} tables, {provider.column_count} columns"
            )

            return provider

    def clear(self) -> None:
        """Clear all cached providers."""
        self._providers.clear()

    def clear_source(self, source_name: str, run_id: str = DEFAULT_RUN_ID) -> None:
        """
        Clear cached provider for a specific source.

        Args:
            source_name: Name of the source to clear
            run_id: Run ID for the cached entry
        """
        cache_key = f"{source_name}:{run_id}"
        if cache_key in self._providers:
            del self._providers[cache_key]

    @property
    def cached_sources(self) -> int:
        """Number of sources currently cached."""
        return len(self._providers)
