"""
Schema aggregation utilities for storing SQLGlot schemas from sources.
"""

import os
import json
from datetime import datetime
from typing import Dict, Any, List, Optional
from sqlglot import exp
from sqlglot.schema import MappingSchema

from visivo.logger.logger import Logger
from visivo.query.sqlglot_type_mapper import SqlglotTypeMapper


class SchemaAggregator:
    """Handles storage and retrieval of source schemas in SQLGlot format."""

    @staticmethod
    def aggregate_source_schema(
        source_name: str, source_type: str, schema_data: Dict[str, Any], output_dir: str
    ) -> None:
        """
        Store source schema data in standard format.

        Args:
            source_name: Name of the source
            source_type: Type of the source (postgresql, mysql, etc.)
            schema_data: Schema data dictionary
            output_dir: Output directory for storage
        """
        try:
            # Create schema directory
            schema_dir = f"{output_dir}/schemas/{source_name}"
            os.makedirs(schema_dir, exist_ok=True)

            # Prepare schema data for storage
            storage_data = {
                "source_name": source_name,
                "source_type": source_type,
                "generated_at": datetime.now().isoformat(),
                "tables": {},
                "sqlglot_schema": {},
                "metadata": {"total_tables": 0, "total_columns": 0, "databases": []},
            }

            # Process schema data
            if "tables" in schema_data:
                storage_data["tables"] = SchemaAggregator._process_table_schemas(
                    schema_data["tables"]
                )

            if "sqlglot_schema" in schema_data:
                storage_data["sqlglot_schema"] = SchemaAggregator._serialize_mapping_schema(
                    schema_data["sqlglot_schema"]
                )

            if "metadata" in schema_data:
                storage_data["metadata"].update(schema_data["metadata"])

            # Calculate metadata
            total_tables = len(storage_data["tables"])
            total_columns = sum(
                len(table_info.get("columns", {})) for table_info in storage_data["tables"].values()
            )
            storage_data["metadata"]["total_tables"] = total_tables
            storage_data["metadata"]["total_columns"] = total_columns

            # Write to file
            schema_file = f"{schema_dir}/schema.json"
            with open(schema_file, "w") as fp:
                json.dump(storage_data, fp, indent=2, default=str)

            Logger.instance().debug(
                f"Stored schema for source '{source_name}' with {total_tables} tables "
                f"and {total_columns} columns"
            )

        except Exception as e:
            Logger.instance().error(f"Error storing schema for source {source_name}: {e}")
            raise

    @staticmethod
    def _process_table_schemas(tables_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process and normalize table schema data.

        Args:
            tables_data: Raw table schema data

        Returns:
            Processed table schema data
        """
        processed_tables = {}

        for table_name, table_info in tables_data.items():
            processed_table = {"columns": {}, "metadata": {}}

            # Process columns - store just type string and nullable flag
            if "columns" in table_info:
                for col_name, col_info in table_info["columns"].items():
                    if isinstance(col_info, dict) and "type" in col_info:
                        # Already has type info
                        processed_table["columns"][col_name] = {
                            "type": col_info["type"],
                            "nullable": col_info.get("nullable", True),
                        }
                    elif isinstance(col_info, exp.DataType):
                        # Convert DataType to string
                        processed_table["columns"][col_name] = {
                            "type": col_info.sql(),
                            "nullable": True,
                        }
                    else:
                        # Use string representation
                        processed_table["columns"][col_name] = {
                            "type": str(col_info),
                            "nullable": True,
                        }

            # Add metadata
            if "metadata" in table_info:
                processed_table["metadata"] = table_info["metadata"]

            processed_tables[table_name] = processed_table

        return processed_tables

    @staticmethod
    def _serialize_mapping_schema(mapping_schema: MappingSchema) -> Dict[str, Any]:
        """
        Serialize SQLGlot MappingSchema to simple dict format.

        Args:
            mapping_schema: SQLGlot MappingSchema instance

        Returns:
            Dict mapping table names to column dicts with type strings
            Format: {"table_name": {"col1": "INT", "col2": "VARCHAR"}}
        """
        try:
            serialized = {}

            # Access the internal mapping if available
            if hasattr(mapping_schema, "_mapping"):
                mapping = mapping_schema._mapping
            elif hasattr(mapping_schema, "mapping"):
                mapping = mapping_schema.mapping
            else:
                # Try to iterate through the schema
                mapping = {}
                # MappingSchema might be iterable or have other access methods
                Logger.instance().debug("Unable to access MappingSchema internal mapping")

            for table_key, columns in mapping.items():
                table_name = str(table_key)
                serialized[table_name] = {}

                for col_name, col_type in columns.items():
                    # Store just the SQL string representation
                    if isinstance(col_type, exp.DataType):
                        serialized[table_name][col_name] = col_type.sql()
                    else:
                        serialized[table_name][col_name] = str(col_type)

            return serialized

        except Exception as e:
            Logger.instance().debug(f"Error serializing MappingSchema: {e}")
            return {}

    @staticmethod
    def load_source_schema(source_name: str, output_dir: str) -> Optional[Dict[str, Any]]:
        """
        Load stored schema data for a source.

        Args:
            source_name: Name of the source
            output_dir: Output directory where schemas are stored

        Returns:
            Schema data dictionary or None if not found
        """
        try:
            schema_file = f"{output_dir}/schemas/{source_name}/schema.json"
            if not os.path.exists(schema_file):
                return None

            with open(schema_file, "r") as fp:
                return json.load(fp)

        except Exception as e:
            Logger.instance().debug(f"Error loading schema for source {source_name}: {e}")
            return None

    @staticmethod
    def build_mapping_schema_from_stored(schema_data: Dict[str, Any]) -> MappingSchema:
        """
        Build SQLGlot MappingSchema from stored schema data.

        Args:
            schema_data: Stored schema data with "sqlglot_schema" key

        Returns:
            SQLGlot MappingSchema instance
        """
        schema = MappingSchema()

        try:
            # Get the sqlglot_schema - it's already {table: {col: type_str}}
            sqlglot_schema_data = schema_data.get("sqlglot_schema", {})

            for table_name, columns in sqlglot_schema_data.items():
                column_types = {}

                for col_name, col_type_str in columns.items():
                    # Parse the type string to DataType
                    column_types[col_name] = exp.DataType.build(col_type_str)

                # Add table to schema
                if column_types:
                    schema.add_table(table_name, column_types)

        except Exception as e:
            Logger.instance().error(f"Error building MappingSchema from stored data: {e}")

        return schema

    @staticmethod
    def list_stored_schemas(output_dir: str) -> List[Dict[str, Any]]:
        """
        List all stored schemas with basic metadata.

        Args:
            output_dir: Output directory where schemas are stored

        Returns:
            List of schema metadata dictionaries
        """
        schemas = []
        schemas_dir = f"{output_dir}/schemas"

        if not os.path.exists(schemas_dir):
            return schemas

        try:
            for source_name in os.listdir(schemas_dir):
                source_dir = os.path.join(schemas_dir, source_name)
                if os.path.isdir(source_dir):
                    schema_file = os.path.join(source_dir, "schema.json")
                    if os.path.exists(schema_file):
                        try:
                            with open(schema_file, "r") as fp:
                                schema_data = json.load(fp)
                                schemas.append(
                                    {
                                        "source_name": schema_data.get("source_name", source_name),
                                        "source_type": schema_data.get("source_type", "unknown"),
                                        "generated_at": schema_data.get("generated_at"),
                                        "total_tables": schema_data.get("metadata", {}).get(
                                            "total_tables", 0
                                        ),
                                        "total_columns": schema_data.get("metadata", {}).get(
                                            "total_columns", 0
                                        ),
                                    }
                                )
                        except Exception as e:
                            Logger.instance().debug(f"Error reading schema file {schema_file}: {e}")

        except Exception as e:
            Logger.instance().debug(f"Error listing schemas: {e}")

        return schemas
