"""One profiler for anything DuckDB can read (VIS-1412).

- Tier 1: parquet metadata only (row count, min/max from row-group stats).
- Tier 2 / ``profile_model``: a built model's parquet, via DuckDB.
- ``profile_query``: a bounded sample of any SQL on any source, pulled into
  DuckDB and profiled the same way.
- ``get_histogram``: buckets for one column.

Every profile has one column shape, the one the viewer already renders:
``name, type, null_count, null_percentage, distinct, min, max, avg, median,
std_dev, q25, q75`` plus ``p99, zeros_pct, avg_length, top_values``. The
Explorer and the agent read the same dict, and ``shape_cards`` turns it into
the classification both choose charts from.
"""

import os
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import pyarrow as pa
import pyarrow.parquet as pq
import duckdb
import sqlglot
from sqlglot import exp

from visivo.constants import DEFAULT_RUN_ID
from visivo.jobs.run_model_data_job import AGENT_QUERY_TIMEOUT_S, execute_and_get_result
from visivo.logger.logger import Logger
from visivo.output_paths import model_data_file, run_dir
from visivo.server.services.shape_card import shape_cards

# A profile is a scan per column, so the column count is the cost. Forty is
# generous for a real table and small enough that nothing times out.
MAX_PROFILE_COLUMNS = 40
# Rows pulled from a source to profile a query. Exact counts come from a
# separate COUNT(*); everything else is measured on the sample.
DEFAULT_SAMPLE_ROWS = 100_000
DEFAULT_TOP_N = 20
# Above this many distinct values a top-N is noise.
TOP_N_MAX_DISTINCT = 1000

# Cache TTL in seconds (5 minutes)
CACHE_TTL_SECONDS = 300


class ProfilingService:
    """Service for profiling parquet files associated with models."""

    def __init__(self, output_dir: str, run_id: str = DEFAULT_RUN_ID):
        """
        Initialize the profiling service.

        Args:
            output_dir: The project's output directory (the parent of run directories)
            run_id: The run whose model parquet is profiled
        """
        self.output_dir = output_dir
        self.run_id = run_id
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._cache_timestamps: Dict[str, float] = {}

    def get_parquet_path(self, model_name: str) -> str:
        """The file ``run_model_data_job`` wrote for this model, via the one
        definition of that path in ``output_paths``."""
        return model_data_file(run_dir(self.output_dir, self.run_id), model_name)

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
        """A built model's full profile. Kept for the existing route; the
        shape is ``profile_model``'s."""
        return self.profile_model(model_name)

    def profile_model(self, model_name: str, columns=None, top_n: int = DEFAULT_TOP_N):
        """Profile a built model's parquet. Cached per model until invalidated
        or ``CACHE_TTL_SECONDS`` passes."""
        cache_key = f"tier2_{model_name}"
        if columns is None and top_n == DEFAULT_TOP_N and self._is_cache_valid(cache_key):
            return self._cache[cache_key]

        parquet_path = self.get_parquet_path(model_name)
        if not os.path.exists(parquet_path):
            raise FileNotFoundError(f"Parquet file not found for model: {model_name}")

        conn = duckdb.connect(":memory:")
        try:
            escaped_path = parquet_path.replace("'", "''")
            profile = self._profile_relation(
                conn, f"read_parquet('{escaped_path}')", columns=columns, top_n=top_n
            )
        finally:
            conn.close()
        profile.update(model_name=model_name, tier=2, sampled=False, sample_rows=None)
        if columns is None and top_n == DEFAULT_TOP_N:
            self._cache[cache_key] = profile
            self._cache_timestamps[cache_key] = time.time()
        return profile

    def profile_query(
        self,
        source,
        sql: str,
        columns=None,
        sample_rows: int = DEFAULT_SAMPLE_ROWS,
        timeout_s: float = AGENT_QUERY_TIMEOUT_S,
        top_n: int = DEFAULT_TOP_N,
    ):
        """Profile ``sql`` on ``source`` from a bounded sample.

        The sample is pulled with the source's own dialect (via SQLGlot), the
        exact row count comes from one ``COUNT(*)``, and the statistics are
        DuckDB's over the sample — the same statistics a model's parquet gets,
        so the two paths agree on every field.
        """
        dialect = source.get_sqlglot_dialect()
        parsed = sqlglot.parse_one(sql, read=dialect)
        inner = parsed.subquery(alias="visivo_profiled")
        sample_sql = exp.select("*").from_(inner).limit(sample_rows).sql(dialect=dialect)
        count_sql = (
            exp.select(exp.func("COUNT", exp.Star())).from_(inner.copy()).sql(dialect=dialect)
        )

        sample = execute_and_get_result(
            source, sample_sql, max_rows=sample_rows, timeout_s=timeout_s
        )
        total_rows = None
        try:
            counted = execute_and_get_result(source, count_sql, timeout_s=timeout_s)["rows"]
            total_rows = int(next(iter(counted[0].values()))) if counted else None
        except Exception as error:  # the sample still profiles
            Logger.instance().debug(f"profile_query: COUNT(*) skipped: {error}")

        rows = sample["rows"]
        sampled = total_rows is not None and total_rows > len(rows)
        if not rows:
            # A driver answers an empty result with no column names, so there
            # is nothing to describe beyond "zero rows".
            profile = {
                "row_count": 0,
                "columns": [],
                "columns_truncated": False,
                "profiled_at": datetime.now(timezone.utc).isoformat(),
            }
        else:
            conn = duckdb.connect(":memory:")
            try:
                conn.register("visivo_sample", pa.Table.from_pylist(rows))
                profile = self._profile_relation(
                    conn, "visivo_sample", columns=columns, top_n=top_n
                )
            finally:
                conn.close()
        profile.update(
            sampled=sampled,
            sample_rows=len(rows) if sampled else None,
            row_count=total_rows if total_rows is not None else profile["row_count"],
        )
        return profile

    def shape_cards(self, profile):
        """The profile's columns classified for chart choice."""
        return [card.model_dump(mode="json") for card in shape_cards(profile)]

    # --- the shared engine --------------------------------------------------

    @staticmethod
    def _quote(name: str) -> str:
        return '"' + name.replace('"', '""') + '"'

    def _profile_relation(self, conn, relation: str, columns=None, top_n: int = DEFAULT_TOP_N):
        """Profile ``relation`` (anything that can follow ``FROM``) on ``conn``."""
        summary = conn.execute(f"SUMMARIZE SELECT * FROM {relation}").fetchall()
        names = [desc[0] for desc in conn.description]
        rows = [dict(zip(names, row)) for row in summary]
        if columns is not None:
            wanted = set(columns)
            rows = [r for r in rows if r["column_name"] in wanted]
        columns_truncated = len(rows) > MAX_PROFILE_COLUMNS
        rows = rows[:MAX_PROFILE_COLUMNS]

        row_count = conn.execute(f"SELECT COUNT(*) FROM {relation}").fetchone()[0]
        exact = self._exact_counts(conn, relation, [r["column_name"] for r in rows])
        numeric_extras = self._numeric_extras(
            conn,
            relation,
            [r["column_name"] for r in rows if self._is_numeric_type(r["column_type"])],
        )
        text_extras = self._text_extras(
            conn, relation, [r["column_name"] for r in rows if self._is_text_type(r["column_type"])]
        )

        profiled = []
        for row in rows:
            name, col_type = row["column_name"], row["column_type"]
            numeric = self._is_numeric_type(col_type)
            distinct, non_null = exact.get(name, (None, None))
            null_count = row_count - non_null if non_null is not None else None
            column = {
                "name": name,
                "type": col_type,
                "null_count": null_count,
                "null_percentage": self._convert_duckdb_value(row.get("null_percentage")),
                "distinct": distinct,
                "min": self._typed_bound(row.get("min"), numeric),
                "max": self._typed_bound(row.get("max"), numeric),
                "avg": self._number(row.get("avg")) if numeric else None,
                "median": self._number(row.get("q50")) if numeric else None,
                "std_dev": self._number(row.get("std")) if numeric else None,
                "q25": self._number(row.get("q25")) if numeric else None,
                "q75": self._number(row.get("q75")) if numeric else None,
                "p99": numeric_extras.get(name, {}).get("p99"),
                "zeros_pct": numeric_extras.get(name, {}).get("zeros_pct"),
                "avg_length": text_extras.get(name),
                "top_values": [],
            }
            if distinct is not None and 0 < distinct <= TOP_N_MAX_DISTINCT and top_n:
                column["top_values"] = self._top_values(conn, relation, name, top_n)
            profiled.append(column)

        return {
            "row_count": row_count,
            "columns": profiled,
            "columns_truncated": columns_truncated,
            "profiled_at": datetime.now(timezone.utc).isoformat(),
        }

    def _exact_counts(self, conn, relation, names):
        """``{name: (distinct, non_null)}`` in one scan."""
        if not names:
            return {}
        parts = []
        for i, name in enumerate(names):
            q = self._quote(name)
            parts.append(f"COUNT(DISTINCT {q}) AS d_{i}, COUNT({q}) AS n_{i}")
        row = conn.execute(f"SELECT {', '.join(parts)} FROM {relation}").fetchone()
        return {name: (row[2 * i], row[2 * i + 1]) for i, name in enumerate(names)}

    def _numeric_extras(self, conn, relation, names):
        if not names:
            return {}
        parts = []
        for i, name in enumerate(names):
            q = self._quote(name)
            parts.append(
                f"quantile_cont({q}, 0.99) AS p_{i}, "
                f"SUM(CASE WHEN {q} = 0 THEN 1 ELSE 0 END)::DOUBLE / NULLIF(COUNT({q}), 0) AS z_{i}"
            )
        row = conn.execute(f"SELECT {', '.join(parts)} FROM {relation}").fetchone()
        return {
            name: {
                "p99": self._number(row[2 * i]),
                "zeros_pct": self._number(row[2 * i + 1]),
            }
            for i, name in enumerate(names)
        }

    def _text_extras(self, conn, relation, names):
        if not names:
            return {}
        parts = [f"AVG(LENGTH({self._quote(n)})) AS l_{i}" for i, n in enumerate(names)]
        row = conn.execute(f"SELECT {', '.join(parts)} FROM {relation}").fetchone()
        return {name: self._number(row[i]) for i, name in enumerate(names)}

    def _top_values(self, conn, relation, name, top_n):
        q = self._quote(name)
        result = conn.execute(
            f"SELECT {q} AS value, COUNT(*) AS count FROM {relation} "
            f"WHERE {q} IS NOT NULL GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT {int(top_n)}"
        ).fetchall()
        return [{"value": self._convert_duckdb_value(v), "count": c} for v, c in result]

    @staticmethod
    def _number(value):
        """SUMMARIZE renders statistics as strings; the profile carries numbers."""
        if value is None or value == "" or value == "NULL":
            return None
        try:
            number = float(value)
        except (TypeError, ValueError):
            return None
        return None if number != number else number

    def _typed_bound(self, value, numeric):
        if value is None or value == "":
            return None
        if numeric:
            try:
                return (
                    float(value) if "." in str(value) or "e" in str(value).lower() else int(value)
                )
            except (TypeError, ValueError):
                return self._convert_duckdb_value(value)
        return str(value)

    @staticmethod
    def _is_numeric_type(col_type):
        upper = str(col_type or "").upper()
        return any(
            upper.startswith(t)
            for t in (
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
            )
        )

    @staticmethod
    def _is_text_type(col_type):
        upper = str(col_type or "").upper()
        return any(t in upper for t in ("VARCHAR", "TEXT", "STRING", "CHAR"))

    def _null_count(self, null_percentage: Any, row_count: int) -> Optional[int]:
        """SUMMARIZE reports nulls as a percentage; callers want the count."""
        pct = self._convert_duckdb_value(null_percentage)
        if pct is None:
            return None
        return int(round(float(pct) / 100 * row_count))

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
