"""
SQLGlot type mapping utilities for converting database types to SQLGlot DataTypes.
"""

import sqlglot
from sqlglot import exp
from sqlalchemy import types as sa_types
from typing import Dict, Any, Optional, Union
from visivo.logger.logger import Logger


class SqlglotTypeMapper:
    """Maps database-specific types to SQLGlot DataTypes."""

    @staticmethod
    def sqlalchemy_to_sqlglot_type(sa_type: sa_types.TypeEngine) -> exp.DataType:
        """
        Convert SQLAlchemy type to SQLGlot DataType.

        Args:
            sa_type: SQLAlchemy TypeEngine instance

        Returns:
            SQLGlot DataType expression
        """
        try:
            # Get the type name and handle generics
            type_name = str(sa_type).upper()

            # Map common SQLAlchemy types to SQLGlot types
            if isinstance(sa_type, sa_types.String):
                if hasattr(sa_type, "length") and sa_type.length:
                    return exp.DataType.build(f"VARCHAR({sa_type.length})")
                return exp.DataType.build("VARCHAR")

            elif isinstance(sa_type, sa_types.Text):
                return exp.DataType.build("TEXT")

            elif isinstance(sa_type, sa_types.Integer):
                return exp.DataType.build("INT")

            elif isinstance(sa_type, sa_types.BigInteger):
                return exp.DataType.build("BIGINT")

            elif isinstance(sa_type, sa_types.SmallInteger):
                return exp.DataType.build("SMALLINT")

            elif isinstance(sa_type, sa_types.Float):
                return exp.DataType.build("FLOAT")

            elif isinstance(sa_type, sa_types.Numeric):
                if hasattr(sa_type, "precision") and hasattr(sa_type, "scale"):
                    if sa_type.precision and sa_type.scale:
                        return exp.DataType.build(f"DECIMAL({sa_type.precision}, {sa_type.scale})")
                    elif sa_type.precision:
                        return exp.DataType.build(f"DECIMAL({sa_type.precision})")
                return exp.DataType.build("DECIMAL")

            elif isinstance(sa_type, sa_types.Boolean):
                return exp.DataType.build("BOOLEAN")

            elif isinstance(sa_type, sa_types.Date):
                return exp.DataType.build("DATE")

            elif isinstance(sa_type, sa_types.DateTime):
                return exp.DataType.build("TIMESTAMP")

            elif isinstance(sa_type, sa_types.Time):
                return exp.DataType.build("TIME")

            elif isinstance(sa_type, sa_types.JSON):
                return exp.DataType.build("JSON")

            elif isinstance(sa_type, sa_types.LargeBinary):
                return exp.DataType.build("BLOB")

            # Handle array types
            elif hasattr(sa_types, "ARRAY") and isinstance(sa_type, sa_types.ARRAY):
                item_type = SqlglotTypeMapper.sqlalchemy_to_sqlglot_type(sa_type.item_type)
                return exp.DataType.build(f"ARRAY<{item_type.sql()}>")

            # Fallback: try to parse the string representation
            else:
                return SqlglotTypeMapper._parse_type_string(type_name)

        except Exception as e:
            Logger.instance().debug(f"Error mapping SQLAlchemy type {sa_type}: {e}")
            return exp.DataType.build("VARCHAR")  # Safe fallback

    @staticmethod
    def _parse_type_string(type_str: str) -> exp.DataType:
        """
        Parse a type string into SQLGlot DataType.

        Args:
            type_str: String representation of the type

        Returns:
            SQLGlot DataType expression
        """
        try:
            # Clean up the type string
            type_str = type_str.strip().upper()

            # Handle common type patterns
            if type_str.startswith("VARCHAR"):
                return exp.DataType.build(type_str)
            elif type_str.startswith("CHAR"):
                return exp.DataType.build(type_str)
            elif type_str in ["TEXT", "LONGTEXT", "MEDIUMTEXT"]:
                return exp.DataType.build("TEXT")
            elif type_str in ["INT", "INTEGER"]:
                return exp.DataType.build("INT")
            elif type_str in ["BIGINT", "LONG"]:
                return exp.DataType.build("BIGINT")
            elif type_str in ["SMALLINT", "SHORT"]:
                return exp.DataType.build("SMALLINT")
            elif type_str in ["TINYINT"]:
                return exp.DataType.build("TINYINT")
            elif type_str in ["FLOAT", "REAL"]:
                return exp.DataType.build("FLOAT")
            elif type_str in ["DOUBLE", "DOUBLE PRECISION"]:
                return exp.DataType.build("DOUBLE")
            elif type_str.startswith("DECIMAL") or type_str.startswith("NUMERIC"):
                return exp.DataType.build(type_str)
            elif type_str in ["BOOLEAN", "BOOL"]:
                return exp.DataType.build("BOOLEAN")
            elif type_str in ["DATE"]:
                return exp.DataType.build("DATE")
            elif type_str in ["TIMESTAMP", "DATETIME"]:
                return exp.DataType.build("TIMESTAMP")
            elif type_str in ["TIME"]:
                return exp.DataType.build("TIME")
            elif type_str in ["JSON", "JSONB"]:
                return exp.DataType.build("JSON")
            elif type_str in ["BLOB", "BINARY", "VARBINARY"]:
                return exp.DataType.build("BLOB")
            else:
                # Try to parse directly with SQLGlot
                return exp.DataType.build(type_str)

        except Exception as e:
            Logger.instance().debug(f"Error parsing type string {type_str}: {e}")
            return exp.DataType.build("VARCHAR")  # Safe fallback

    @staticmethod
    def infer_file_column_type(sample_values: list, column_name: str) -> exp.DataType:
        """
        Infer SQLGlot DataType from sample values in file-based sources.

        Args:
            sample_values: List of sample values from the column
            column_name: Name of the column for logging

        Returns:
            SQLGlot DataType expression
        """
        if not sample_values:
            return exp.DataType.build("VARCHAR")

        # Remove None/null values for analysis
        non_null_values = [v for v in sample_values if v is not None and str(v).strip()]

        if not non_null_values:
            return exp.DataType.build("VARCHAR")

        try:
            # Try to infer type from sample values
            first_value = non_null_values[0]

            # Check if all values can be parsed as integers
            try:
                all_ints = all(str(v).strip().lstrip("-").isdigit() for v in non_null_values)
                if all_ints:
                    # Check range to determine int type
                    max_val = max(int(v) for v in non_null_values)
                    min_val = min(int(v) for v in non_null_values)

                    if -2147483648 <= min_val <= max_val <= 2147483647:
                        return exp.DataType.build("INT")
                    else:
                        return exp.DataType.build("BIGINT")
            except (ValueError, TypeError):
                pass

            # Check if all values can be parsed as floats
            try:
                all_floats = all(
                    str(v)
                    .replace(".", "")
                    .replace("-", "")
                    .replace("+", "")
                    .replace("e", "")
                    .replace("E", "")
                    .isdigit()
                    for v in non_null_values
                    if "." in str(v) or "e" in str(v).lower()
                )
                if all_floats:
                    return exp.DataType.build("FLOAT")
            except (ValueError, TypeError):
                pass

            # Check for boolean values
            bool_values = {"true", "false", "1", "0", "yes", "no", "t", "f"}
            if all(str(v).lower() in bool_values for v in non_null_values):
                return exp.DataType.build("BOOLEAN")

            # Check for date/timestamp patterns
            if SqlglotTypeMapper._looks_like_date(str(first_value)):
                return exp.DataType.build("DATE")

            if SqlglotTypeMapper._looks_like_timestamp(str(first_value)):
                return exp.DataType.build("TIMESTAMP")

            # Default to VARCHAR
            return exp.DataType.build("VARCHAR")

        except Exception as e:
            Logger.instance().debug(f"Error inferring type for column {column_name}: {e}")
            return exp.DataType.build("VARCHAR")

    @staticmethod
    def _looks_like_date(value: str) -> bool:
        """Check if a string value looks like a date."""
        import re

        date_patterns = [
            r"\d{4}-\d{2}-\d{2}",  # YYYY-MM-DD
            r"\d{2}/\d{2}/\d{4}",  # MM/DD/YYYY
            r"\d{2}-\d{2}-\d{4}",  # MM-DD-YYYY
        ]
        return any(re.match(pattern, value.strip()) for pattern in date_patterns)

    @staticmethod
    def _looks_like_timestamp(value: str) -> bool:
        """Check if a string value looks like a timestamp."""
        import re

        timestamp_patterns = [
            r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}",  # YYYY-MM-DD HH:MM:SS
            r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}",  # ISO format
        ]
        return any(re.match(pattern, value.strip()) for pattern in timestamp_patterns)

    @staticmethod
    def serialize_datatype(datatype: exp.DataType) -> Dict[str, Any]:
        """
        Serialize SQLGlot DataType to JSON-serializable format.

        Args:
            datatype: SQLGlot DataType expression

        Returns:
            Dictionary representation
        """
        return {
            "sql": datatype.sql(),
            "type": str(datatype.this) if datatype.this else None,
            "expressions": (
                [expr.sql() for expr in datatype.expressions] if datatype.expressions else []
            ),
        }

    @staticmethod
    def deserialize_datatype(data: Dict[str, Any]) -> exp.DataType:
        """
        Deserialize SQLGlot DataType from JSON format.

        Args:
            data: Dictionary representation

        Returns:
            SQLGlot DataType expression
        """
        try:
            return exp.DataType.build(data["sql"])
        except Exception as e:
            Logger.instance().debug(f"Error deserializing datatype {data}: {e}")
            return exp.DataType.build("VARCHAR")
