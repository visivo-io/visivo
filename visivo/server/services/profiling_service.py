"""Profiling service for model parquet files.

Provides tiered profiling capabilities:
- Tier 1: Fast metadata from parquet (row count, column info, min/max from stats)
- Tier 2: Full statistics using DuckDB SUMMARIZE
- Tier 3: Histograms for specific columns
"""

import os
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import pyarrow.parquet as pq
import duckdb

from visivo.logger.logger import Logger


# Cache TTL in seconds (5 minutes)
CACHE_TTL_SECONDS = 300


class ProfilingService:
    """Service for profiling parquet files associated with models."""

    def __init__(self, output_dir: str):
        """
        Initialize the profiling service.

        Args:
            output_dir: Directory where parquet files are stored
        """
        self.output_dir = output_dir
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._cache_timestamps: Dict[str, float] = {}

    def get_parquet_path(self, model_name: str) -> str:
        """
        Get the parquet file path for a model.

        Args:
            model_name: Name of the model

        Returns:
            Full path to the parquet file
        """
        return os.path.join(self.output_dir, f"{model_name}.parquet")

    def parquet_exists(self, model_name: str) -> bool:
        """
        Check if a parquet file exists for the given model.

        Args:
            model_name: Name of the model

        Returns:
            True if the parquet file exists, False otherwise
        """
        return os.path.exists(self.get_parquet_path(model_name))

    def get_tier1_profile(self, model_name: str) -> Dict[str, Any]:
        """
        Get tier 1 profile using PyArrow metadata (fast, < 100ms).

        Extracts metadata without scanning the actual data:
        - Row count from metadata
        - Column names and types
        - Min/max values from row group statistics (if available)
        - Null counts

        Args:
            model_name: Name of the model

        Returns:
            Dictionary with profile data

        Raises:
            FileNotFoundError: If parquet file doesn't exist
        """
        parquet_path = self.get_parquet_path(model_name)
        if not os.path.exists(parquet_path):
            raise FileNotFoundError(f"Parquet file not found for model: {model_name}")

        parquet_file = pq.ParquetFile(parquet_path)
        metadata = parquet_file.metadata
        schema = parquet_file.schema_arrow

        # Get row count from metadata
        row_count = metadata.num_rows

        # Build column profiles from schema and row group stats
        columns = []
        for i, field in enumerate(schema):
            col_profile = {
                "name": field.name,
                "type": str(field.type),
                "nullable": field.nullable,
                "min": None,
                "max": None,
                "null_count": 0,
            }

            # Aggregate statistics from all row groups
            for rg_idx in range(metadata.num_row_groups):
                rg = metadata.row_group(rg_idx)
                col_meta = rg.column(i)
                if col_meta.is_stats_set:
                    stats = col_meta.statistics
                    if stats.has_min_max:
                        # Update min
                        if col_profile["min"] is None:
                            col_profile["min"] = self._convert_stat_value(stats.min)
                        else:
                            try:
                                stat_min = self._convert_stat_value(stats.min)
                                if stat_min is not None and stat_min < col_profile["min"]:
                                    col_profile["min"] = stat_min
                            except (TypeError, ValueError):
                                pass

                        # Update max
                        if col_profile["max"] is None:
                            col_profile["max"] = self._convert_stat_value(stats.max)
                        else:
                            try:
                                stat_max = self._convert_stat_value(stats.max)
                                if stat_max is not None and stat_max > col_profile["max"]:
                                    col_profile["max"] = stat_max
                            except (TypeError, ValueError):
                                pass

                    if stats.null_count is not None:
                        col_profile["null_count"] += stats.null_count

            columns.append(col_profile)

        return {
            "model_name": model_name,
            "tier": 1,
            "row_count": row_count,
            "columns": columns,
            "profiled_at": datetime.now(timezone.utc).isoformat(),
        }

    def _convert_stat_value(self, value: Any) -> Any:
        """Convert parquet statistic value to a JSON-serializable type."""
        if value is None:
            return None
        # Handle bytes (common for string columns in parquet stats)
        if isinstance(value, bytes):
            try:
                return value.decode("utf-8")
            except UnicodeDecodeError:
                return None
        # Handle datetime/date objects
        if hasattr(value, "isoformat"):
            return value.isoformat()
        # Handle numpy types
        if hasattr(value, "item"):
            return value.item()
        return value

    def get_tier2_profile(self, model_name: str) -> Dict[str, Any]:
        """
        Get tier 2 profile using DuckDB SUMMARIZE (100ms - 2s).

        Provides comprehensive statistics including:
        - All tier 1 stats
        - avg, std, q25, q50, q75
        - approx_unique count
        - null_percentage

        Results are cached with TTL.

        Args:
            model_name: Name of the model

        Returns:
            Dictionary with full profile data

        Raises:
            FileNotFoundError: If parquet file doesn't exist
        """
        cache_key = f"tier2_{model_name}"

        # Check cache
        if self._is_cache_valid(cache_key):
            return self._cache[cache_key]

        parquet_path = self.get_parquet_path(model_name)
        if not os.path.exists(parquet_path):
            raise FileNotFoundError(f"Parquet file not found for model: {model_name}")

        conn = None
        try:
            conn = duckdb.connect(":memory:")
            # Use SUMMARIZE to get comprehensive statistics
            # Escape the path for SQL
            escaped_path = parquet_path.replace("'", "''")
            result = conn.execute(
                f"SUMMARIZE SELECT * FROM read_parquet('{escaped_path}')"
            ).fetchall()
            column_names = [desc[0] for desc in conn.description]

            # Get row count
            row_count_result = conn.execute(
                f"SELECT COUNT(*) FROM read_parquet('{escaped_path}')"
            ).fetchone()
            row_count = row_count_result[0] if row_count_result else 0

            # Parse SUMMARIZE results into column profiles
            columns = []
            for row in result:
                row_dict = dict(zip(column_names, row))
                col_profile = {
                    "name": row_dict.get("column_name"),
                    "type": row_dict.get("column_type"),
                    "min": self._convert_duckdb_value(row_dict.get("min")),
                    "max": self._convert_duckdb_value(row_dict.get("max")),
                    "avg": self._convert_duckdb_value(row_dict.get("avg")),
                    "std": self._convert_duckdb_value(row_dict.get("std")),
                    "q25": self._convert_duckdb_value(row_dict.get("q25")),
                    "q50": self._convert_duckdb_value(row_dict.get("q50")),
                    "q75": self._convert_duckdb_value(row_dict.get("q75")),
                    "null_count": self._convert_duckdb_value(row_dict.get("null_percentage")),
                    "null_percentage": self._convert_duckdb_value(row_dict.get("null_percentage")),
                    "approx_unique": self._convert_duckdb_value(row_dict.get("approx_unique")),
                }
                columns.append(col_profile)

            profile = {
                "model_name": model_name,
                "tier": 2,
                "row_count": row_count,
                "columns": columns,
                "profiled_at": datetime.now(timezone.utc).isoformat(),
            }

            # Cache the result
            self._cache[cache_key] = profile
            self._cache_timestamps[cache_key] = time.time()

            return profile

        finally:
            if conn:
                conn.close()

    def _convert_duckdb_value(self, value: Any) -> Any:
        """Convert DuckDB value to a JSON-serializable type."""
        if value is None:
            return None
        # Handle NaN
        if isinstance(value, float) and value != value:  # NaN check
            return None
        # Handle datetime/date objects
        if hasattr(value, "isoformat"):
            return value.isoformat()
        # Handle Decimal
        if hasattr(value, "__float__"):
            try:
                return float(value)
            except (ValueError, OverflowError):
                return str(value)
        return value

    def get_histogram(self, model_name: str, column: str, bins: int = 20) -> Dict[str, Any]:
        """
        Get histogram data for a specific column.

        For numeric columns: Returns bucket ranges with counts
        For categorical columns: Returns top N values by frequency

        Args:
            model_name: Name of the model
            column: Column name to generate histogram for
            bins: Number of bins/buckets (default 20, clamped to 5-100)

        Returns:
            Dictionary with histogram data

        Raises:
            FileNotFoundError: If parquet file doesn't exist
            ValueError: If column doesn't exist
        """
        # Clamp bins to valid range
        bins = max(5, min(100, bins))

        parquet_path = self.get_parquet_path(model_name)
        if not os.path.exists(parquet_path):
            raise FileNotFoundError(f"Parquet file not found for model: {model_name}")

        conn = None
        try:
            conn = duckdb.connect(":memory:")
            escaped_path = parquet_path.replace("'", "''")

            # Get column type first
            schema_result = conn.execute(
                f"DESCRIBE SELECT * FROM read_parquet('{escaped_path}')"
            ).fetchall()

            column_type = None
            # Properly escape column name for SQL using double quotes
            escaped_column = f'"{column.replace(chr(34), chr(34)+chr(34))}"'

            for row in schema_result:
                if row[0] == column:
                    column_type = row[1]
                    break

            if column_type is None:
                raise ValueError(f"Column '{column}' not found in model '{model_name}'")

            # Determine if numeric or categorical
            numeric_types = [
                "BIGINT",
                "INTEGER",
                "SMALLINT",
                "TINYINT",
                "UBIGINT",
                "UINTEGER",
                "USMALLINT",
                "UTINYINT",
                "DOUBLE",
                "FLOAT",
                "REAL",
                "DECIMAL",
                "NUMERIC",
                "HUGEINT",
            ]
            is_numeric = any(nt in column_type.upper() for nt in numeric_types)

            if is_numeric:
                return self._get_numeric_histogram(
                    conn, escaped_path, column, escaped_column, column_type, bins
                )
            else:
                return self._get_categorical_histogram(
                    conn, escaped_path, model_name, column, escaped_column, column_type, bins
                )

        finally:
            if conn:
                conn.close()

    def _get_numeric_histogram(
        self,
        conn: duckdb.DuckDBPyConnection,
        escaped_path: str,
        column: str,
        escaped_column: str,
        column_type: str,
        bins: int,
    ) -> Dict[str, Any]:
        """Generate histogram for numeric column using WIDTH_BUCKET."""
        # Get min/max for bucket calculation
        stats_query = f"""
            SELECT MIN({escaped_column}), MAX({escaped_column}), COUNT(*)
            FROM read_parquet('{escaped_path}')
            WHERE {escaped_column} IS NOT NULL
        """
        stats = conn.execute(stats_query).fetchone()
        min_val, max_val, total_count = stats

        if min_val is None or max_val is None or min_val == max_val:
            # All same value or no data
            if min_val is not None:
                return {
                    "model_name": escaped_path.split("/")[-1].replace(".parquet", ""),
                    "column": column,
                    "column_type": column_type,
                    "buckets": [{"range": f"[{min_val}, {min_val}]", "count": total_count}],
                    "total_count": total_count,
                }
            return {
                "model_name": escaped_path.split("/")[-1].replace(".parquet", ""),
                "column": column,
                "column_type": column_type,
                "buckets": [],
                "total_count": 0,
            }

        # Calculate bucket using FLOOR division (DuckDB compatible)
        bucket_width = (float(max_val) - float(min_val)) / bins
        # FLOOR((value - min) / bucket_width) gives bucket 0 to bins-1
        # We clamp to bins-1 for the max value edge case
        histogram_query = f"""
            SELECT
                LEAST(FLOOR(({escaped_column}::DOUBLE - {float(min_val)}) / {bucket_width}), {bins - 1}) as bucket,
                COUNT(*) as count
            FROM read_parquet('{escaped_path}')
            WHERE {escaped_column} IS NOT NULL
            GROUP BY bucket
            ORDER BY bucket
        """
        result = conn.execute(histogram_query).fetchall()

        buckets = []
        for bucket_num, count in result:
            if bucket_num is None or bucket_num < 0:
                continue
            bucket_idx = int(bucket_num)
            lower = float(min_val) + bucket_idx * bucket_width
            upper = float(min_val) + (bucket_idx + 1) * bucket_width
            buckets.append(
                {
                    "range": f"[{lower:.2f}, {upper:.2f})",
                    "count": count,
                }
            )

        model_name = os.path.basename(escaped_path).replace(".parquet", "").replace("''", "'")
        return {
            "model_name": model_name,
            "column": column,
            "column_type": column_type,
            "buckets": buckets,
            "total_count": total_count,
        }

    def _get_categorical_histogram(
        self,
        conn: duckdb.DuckDBPyConnection,
        escaped_path: str,
        model_name: str,
        column: str,
        escaped_column: str,
        column_type: str,
        bins: int,
    ) -> Dict[str, Any]:
        """Generate histogram for categorical column (top N values)."""
        histogram_query = f"""
            SELECT {escaped_column} as value, COUNT(*) as count
            FROM read_parquet('{escaped_path}')
            WHERE {escaped_column} IS NOT NULL
            GROUP BY {escaped_column}
            ORDER BY count DESC
            LIMIT {bins}
        """
        result = conn.execute(histogram_query).fetchall()

        # Get total count
        total_query = f"""
            SELECT COUNT(*) FROM read_parquet('{escaped_path}')
            WHERE {escaped_column} IS NOT NULL
        """
        total_count = conn.execute(total_query).fetchone()[0]

        buckets = []
        for value, count in result:
            buckets.append(
                {
                    "value": self._convert_duckdb_value(value),
                    "count": count,
                }
            )

        return {
            "model_name": model_name,
            "column": column,
            "column_type": column_type,
            "buckets": buckets,
            "total_count": total_count,
        }

    def invalidate_cache(self, model_name: str) -> None:
        """
        Clear cached profiles for a model.

        Args:
            model_name: Name of the model to invalidate cache for
        """
        cache_key = f"tier2_{model_name}"
        if cache_key in self._cache:
            del self._cache[cache_key]
        if cache_key in self._cache_timestamps:
            del self._cache_timestamps[cache_key]

    def _is_cache_valid(self, cache_key: str) -> bool:
        """Check if a cached item is still valid (not expired)."""
        if cache_key not in self._cache:
            return False
        if cache_key not in self._cache_timestamps:
            return False

        age = time.time() - self._cache_timestamps[cache_key]
        return age < CACHE_TTL_SECONDS
