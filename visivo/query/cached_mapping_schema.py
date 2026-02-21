"""
Cached schema provider for efficient SQLGlot schema operations.

Builds DataType objects ONCE per source and provides filtered views,
eliminating redundant DataType.build() calls across multiple model jobs.
"""

from typing import Dict, Set, Optional, Any
from sqlglot import exp

from visivo.logger.logger import Logger


class CachedMappingSchemaProvider:
    """
    Builds DataTypes ONCE from stored schema, provides filtered views.

    Performance optimization: Instead of calling exp.DataType.build() for every
    column across every model (O(n*m) where n=models, m=columns), this class
    builds all DataTypes once (O(m)) and provides O(t) filtered views where
    t is typically 1-5 tables per query.

    Attributes:
        default_schema: Default schema name for unqualified table references
    """

    def __init__(self, stored_schema: Dict[str, Any], dialect: Optional[str] = None):
        """
        Initialize provider with stored schema data.

        Args:
            stored_schema: Schema data dict with "sqlglot_schema" and "metadata" keys
            dialect: SQLGlot dialect for parsing types (e.g., "snowflake")
        """
        self._flat_schema: Dict[str, Dict[str, exp.DataType]] = {}
        self._nested_schema: Dict[str, Dict[str, Dict[str, exp.DataType]]] = {}
        self._is_nested: bool = False
        self._dialect = dialect

        # Extract default schema from metadata
        self.default_schema: Optional[str] = stored_schema.get("metadata", {}).get("default_schema")

        # Build index from stored schema
        self._build_index(stored_schema)

    def _build_index(self, stored_schema: Dict[str, Any]) -> None:
        """
        Build DataType objects from stored schema.

        Called ONCE per source, building all DataType objects upfront
        so they can be reused across multiple model schema operations.

        Args:
            stored_schema: Schema data with "sqlglot_schema" key
        """
        sqlglot_schema_data = stored_schema.get("sqlglot_schema", {})

        if not sqlglot_schema_data:
            Logger.instance().debug("No sqlglot_schema data found in stored schema")
            return

        # Determine structure: nested {schema: {table: {col: type}}} or flat {table: {col: type}}
        first_key = next(iter(sqlglot_schema_data.keys()), None)
        if first_key is None:
            return

        first_value = sqlglot_schema_data.get(first_key)
        if not isinstance(first_value, dict):
            return

        # Check if nested by examining first value's values
        sample_val = next(iter(first_value.values()), None) if first_value else None

        if isinstance(sample_val, dict):
            # Nested structure: {schema_name: {table_name: {col_name: type_str}}}
            self._is_nested = True
            self._build_nested_index(sqlglot_schema_data)
        else:
            # Flat structure: {table_name: {col_name: type_str}}
            self._is_nested = False
            self._build_flat_index(sqlglot_schema_data)

    def _build_flat_index(self, schema_data: Dict[str, Dict[str, str]]) -> None:
        """Build index for flat schema structure."""
        for table_name, columns in schema_data.items():
            if not isinstance(columns, dict):
                continue

            self._flat_schema[table_name] = {}
            for col_name, col_type_str in columns.items():
                try:
                    self._flat_schema[table_name][col_name] = exp.DataType.build(
                        col_type_str, dialect=self._dialect
                    )
                except Exception as e:
                    Logger.instance().debug(
                        f"Error parsing type '{col_type_str}' for {table_name}.{col_name}, "
                        f"using VARCHAR: {e}"
                    )
                    self._flat_schema[table_name][col_name] = exp.DataType.build("VARCHAR")

    def _build_nested_index(self, schema_data: Dict[str, Dict[str, Dict[str, str]]]) -> None:
        """Build index for nested schema structure."""
        for schema_name, tables in schema_data.items():
            if not isinstance(tables, dict):
                continue

            if schema_name not in self._nested_schema:
                self._nested_schema[schema_name] = {}

            for table_name, columns in tables.items():
                if not isinstance(columns, dict):
                    continue

                self._nested_schema[schema_name][table_name] = {}
                for col_name, col_type_str in columns.items():
                    try:
                        self._nested_schema[schema_name][table_name][col_name] = exp.DataType.build(
                            col_type_str, dialect=self._dialect
                        )
                    except Exception as e:
                        Logger.instance().debug(
                            f"Error parsing type '{col_type_str}' for "
                            f"{schema_name}.{table_name}.{col_name}, using VARCHAR: {e}"
                        )
                        self._nested_schema[schema_name][table_name][col_name] = exp.DataType.build(
                            "VARCHAR"
                        )

    def get_filtered_schema(
        self, tables: Set[str], schema_names: Optional[Set[str]] = None
    ) -> Dict[str, Any]:
        """
        Return schema filtered to only requested tables.

        O(t) operation where t is the number of requested tables (typically 1-5),
        no DataType.build() calls - just reference copying.

        Args:
            tables: Set of table names to include (without schema prefix)
            schema_names: Optional set of schema names to include (for nested schemas)

        Returns:
            Dict suitable for SQLGlot MappingSchema:
            - Flat: {table: {col: DataType}}
            - Nested: {schema: {table: {col: DataType}}}
        """
        if self._is_nested:
            return self._get_filtered_nested_schema(tables, schema_names)
        else:
            return self._get_filtered_flat_schema(tables)

    def _get_filtered_flat_schema(self, tables: Set[str]) -> Dict[str, Dict[str, exp.DataType]]:
        """Get filtered schema for flat structure."""
        result = {}
        for table_name in tables:
            if table_name in self._flat_schema:
                # Reference copy - no new DataType objects created
                result[table_name] = self._flat_schema[table_name]
        return result

    def _get_filtered_nested_schema(
        self, tables: Set[str], schema_names: Optional[Set[str]] = None
    ) -> Dict[str, Dict[str, Dict[str, exp.DataType]]]:
        """Get filtered schema for nested structure."""
        result = {}

        # Determine which schemas to search
        schemas_to_search = schema_names if schema_names else set(self._nested_schema.keys())

        # If default_schema is set, ensure it's included
        if self.default_schema and self.default_schema in self._nested_schema:
            schemas_to_search = schemas_to_search | {self.default_schema}

        for schema_name in schemas_to_search:
            if schema_name not in self._nested_schema:
                continue

            schema_tables = self._nested_schema[schema_name]
            for table_name in tables:
                if table_name in schema_tables:
                    if schema_name not in result:
                        result[schema_name] = {}
                    # Reference copy - no new DataType objects created
                    result[schema_name][table_name] = schema_tables[table_name]

        return result

    def get_full_schema(self) -> Dict[str, Any]:
        """
        Return the complete cached schema.

        Use this when table filtering is not possible or desired.

        Returns:
            Complete schema dict with pre-built DataType objects
        """
        if self._is_nested:
            return self._nested_schema
        else:
            return self._flat_schema

    @property
    def is_nested(self) -> bool:
        """Whether this schema uses nested structure (schema.table.column)."""
        return self._is_nested

    @property
    def table_count(self) -> int:
        """Total number of tables in the schema."""
        if self._is_nested:
            return sum(len(tables) for tables in self._nested_schema.values())
        else:
            return len(self._flat_schema)

    @property
    def column_count(self) -> int:
        """Total number of columns across all tables."""
        count = 0
        if self._is_nested:
            for tables in self._nested_schema.values():
                for columns in tables.values():
                    count += len(columns)
        else:
            for columns in self._flat_schema.values():
                count += len(columns)
        return count
