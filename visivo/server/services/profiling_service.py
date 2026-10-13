"""One profiler for anything DuckDB can read: a built model's parquet, a
bounded sample of any SQL on any source, or a single column's histogram.
The column shape is documented once, in ``shape_card``."""

import functools
import os
import time
from datetime import datetime, timezone
from typing import Dict, Any
import pyarrow as pa
import pyarrow.parquet as pq
import duckdb
import sqlglot
from sqlglot import exp

from visivo.constants import DEFAULT_RUN_ID
from visivo.jobs.run_model_data_job import AGENT_QUERY_TIMEOUT_S, execute_and_get_result
from visivo.logger.logger import Logger
from visivo.output_paths import model_data_file, run_dir
from visivo.server.services.column_types import (
    NUMERIC_KINDS,
    TEXT,
    column_kind,
    is_numeric,
    json_value,
)
from visivo.server.services.shape_card import shape_cards

MAX_PROFILE_COLUMNS = 40
DEFAULT_SAMPLE_ROWS = 100_000
DEFAULT_TOP_N = 20
# Above this many distinct values a top-N is noise.
TOP_N_MAX_DISTINCT = 1000
CACHE_TTL_SECONDS = 300


@functools.lru_cache(maxsize=None)
def profiling_service_for(output_dir: str) -> "ProfilingService":
    """The one service (and profile cache) per output directory."""
    return ProfilingService(output_dir)


class ProfilingService:
    """Profiles for a project's built models and ad-hoc queries."""

    def __init__(self, output_dir: str, run_id: str = DEFAULT_RUN_ID):
        self.output_dir = output_dir
        self.run_id = run_id
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._cache_timestamps: Dict[str, float] = {}

    def get_parquet_path(self, model_name: str) -> str:
        return model_data_file(run_dir(self.output_dir, self.run_id), model_name)

    def parquet_exists(self, model_name: str) -> bool:
        return os.path.exists(self.get_parquet_path(model_name))

    @staticmethod
    def column_subset(columns):
        """``columns`` validated and deduplicated, or ``None`` for every column."""
        if columns is None:
            return None
        if not isinstance(columns, list) or not all(
            isinstance(c, str) and c.strip() for c in columns
        ):
            raise ValueError("'columns' must be a list of column names")
        unique = list(dict.fromkeys(columns))
        if len(unique) > MAX_PROFILE_COLUMNS:
            raise ValueError(f"'columns' may name at most {MAX_PROFILE_COLUMNS} columns")
        return unique

    def get_tier1_profile(self, model_name: str) -> Dict[str, Any]:
        """Row count, types and min/max/null counts from parquet metadata alone."""
        parquet_path = self.get_parquet_path(model_name)
        if not os.path.exists(parquet_path):
            raise FileNotFoundError(f"Parquet file not found for model: {model_name}")

        parquet_file = pq.ParquetFile(parquet_path)
        metadata = parquet_file.metadata
        schema = parquet_file.schema_arrow

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

            for rg_idx in range(metadata.num_row_groups):
                rg = metadata.row_group(rg_idx)
                col_meta = rg.column(i)
                if col_meta.is_stats_set:
                    stats = col_meta.statistics
                    if stats.has_min_max:
                        if col_profile["min"] is None:
                            col_profile["min"] = self._convert_stat_value(stats.min)
                        else:
                            try:
                                stat_min = self._convert_stat_value(stats.min)
                                if stat_min is not None and stat_min < col_profile["min"]:
                                    col_profile["min"] = stat_min
                            except (TypeError, ValueError):
                                pass

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
            "row_count": metadata.num_rows,
            "columns": columns,
            "profiled_at": datetime.now(timezone.utc).isoformat(),
        }

    def _convert_stat_value(self, value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, bytes):
            try:
                return value.decode("utf-8")
            except UnicodeDecodeError:
                return None
        if hasattr(value, "isoformat"):
            return value.isoformat()
        if hasattr(value, "item"):
            return value.item()
        return value

    def profile_model(self, model_name: str, columns=None, top_n: int = DEFAULT_TOP_N):
        """Profile a built model's parquet. The default request is cached per
        model until invalidated or ``CACHE_TTL_SECONDS`` passes."""
        columns = self.column_subset(columns)
        cacheable = columns is None and top_n == DEFAULT_TOP_N
        cache_key = f"tier2_{model_name}"
        if cacheable and self._is_cache_valid(cache_key):
            return self._cache[cache_key]

        parquet_path = self.get_parquet_path(model_name)
        if not os.path.exists(parquet_path):
            raise FileNotFoundError(f"Parquet file not found for model: {model_name}")

        conn = duckdb.connect(":memory:")
        try:
            conn.execute(
                "CREATE TEMP TABLE visivo_model AS SELECT * FROM read_parquet(?)", [parquet_path]
            )
            profile = self._profile_relation(conn, "visivo_model", columns=columns, top_n=top_n)
        finally:
            conn.close()
        profile.update(model_name=model_name, tier=2, sampled=False, sample_rows=None)
        if cacheable:
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
        """Profile ``sql`` on ``source`` from a sample of at most ``sample_rows``
        rows, pulled in the source's dialect. A sample that fills the limit is
        followed by one ``COUNT(*)`` for the exact row count."""
        columns = self.column_subset(columns)
        dialect = source.get_sqlglot_dialect()
        parsed = sqlglot.parse_one(sql, read=dialect)
        inner = parsed.subquery(alias="visivo_profiled")
        sample_sql = exp.select("*").from_(inner).limit(sample_rows).sql(dialect=dialect)

        rows = execute_and_get_result(source, sample_sql, timeout_s=timeout_s)["rows"]
        total_rows = None
        if len(rows) >= sample_rows:
            count_sql = (
                exp.select(exp.func("COUNT", exp.Star())).from_(inner.copy()).sql(dialect=dialect)
            )
            try:
                counted = execute_and_get_result(source, count_sql, timeout_s=timeout_s)["rows"]
                total_rows = int(next(iter(counted[0].values()))) if counted else None
            except Exception as error:
                Logger.instance().debug(f"profile_query: COUNT(*) skipped: {error}")

        sampled = total_rows is not None and total_rows > len(rows)
        if not rows:
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
        return [card.model_dump(mode="json") for card in shape_cards(profile)]

    def _profile_relation(self, conn, relation: str, columns=None, top_n: int = DEFAULT_TOP_N):
        """Profile the table ``relation`` on ``conn`` in three scans: SUMMARIZE,
        one aggregate pass for exact counts and extras, one for top values."""
        summary = conn.execute(f"SUMMARIZE SELECT * FROM {relation}").fetchall()
        names = [desc[0] for desc in conn.description]
        rows = [dict(zip(names, row)) for row in summary]
        row_count = rows[0]["count"] if rows else 0
        if columns is not None:
            wanted = set(columns)
            rows = [r for r in rows if r["column_name"] in wanted]
        columns_truncated = len(rows) > MAX_PROFILE_COLUMNS
        rows = rows[:MAX_PROFILE_COLUMNS]

        kinds = {r["column_name"]: column_kind(r["column_type"]) for r in rows}
        counts = self._aggregate_scan(conn, relation, kinds)
        top_values = self._top_values(
            conn,
            relation,
            [n for n, c in counts.items() if 0 < c["distinct"] <= TOP_N_MAX_DISTINCT],
            top_n,
        )

        profiled = []
        for row in rows:
            name = row["column_name"]
            numeric = kinds[name] in NUMERIC_KINDS
            agg = counts[name]
            profiled.append(
                {
                    "name": name,
                    "type": row["column_type"],
                    "null_count": row_count - agg["non_null"],
                    "null_percentage": json_value(row.get("null_percentage")),
                    "distinct": agg["distinct"],
                    "min": self._typed_bound(row.get("min"), numeric),
                    "max": self._typed_bound(row.get("max"), numeric),
                    "avg": self._number(row.get("avg")) if numeric else None,
                    "median": self._number(row.get("q50")) if numeric else None,
                    "std_dev": self._number(row.get("std")) if numeric else None,
                    "q25": self._number(row.get("q25")) if numeric else None,
                    "q75": self._number(row.get("q75")) if numeric else None,
                    "p99": self._number(agg["p99"]),
                    "zeros_pct": self._number(agg["zeros_pct"]),
                    "avg_length": self._number(agg["avg_length"]),
                    "top_values": top_values.get(name, []),
                }
            )

        return {
            "row_count": row_count,
            "columns": profiled,
            "columns_truncated": columns_truncated,
            "profiled_at": datetime.now(timezone.utc).isoformat(),
        }

    @staticmethod
    def _identifier(name: str) -> str:
        return exp.to_identifier(name, quoted=True).sql("duckdb")

    def _aggregate_scan(self, conn, relation, kinds):
        """``{name: {distinct, non_null, p99, zeros_pct, avg_length}}`` in one
        scan; the extras are ``None`` where the kind has none."""
        if not kinds:
            return {}
        measures = []
        for i, (name, kind) in enumerate(kinds.items()):
            col = self._identifier(name)
            measures += [
                f"COUNT(DISTINCT {col}) AS c{i}_distinct",
                f"COUNT({col}) AS c{i}_non_null",
            ]
            if kind in NUMERIC_KINDS:
                measures += [
                    f"quantile_cont({col}, 0.99) AS c{i}_p99",
                    f"SUM(CASE WHEN {col} = 0 THEN 1 ELSE 0 END)::DOUBLE"
                    f" / NULLIF(COUNT({col}), 0) AS c{i}_zeros_pct",
                ]
            elif kind == TEXT:
                measures.append(f"AVG(LENGTH({col})) AS c{i}_avg_length")
        row = conn.execute(f"SELECT {', '.join(measures)} FROM {relation}").fetchone()
        found = dict(zip([desc[0] for desc in conn.description], row))
        return {
            name: {
                key: found.get(f"c{i}_{key}")
                for key in ("distinct", "non_null", "p99", "zeros_pct", "avg_length")
            }
            for i, name in enumerate(kinds)
        }

    def _top_values(self, conn, relation, names, top_n):
        """``{name: [{value, count}, ...]}`` for every column in ``names``, most
        frequent first (ties by value), in one scan."""
        if not names or not top_n:
            return {}
        measures = [
            f"map_entries(histogram({self._identifier(name)})) AS c{i}"
            for i, name in enumerate(names)
        ]
        row = conn.execute(f"SELECT {', '.join(measures)} FROM {relation}").fetchone()
        result = {}
        for name, entries in zip(names, row):
            pairs = [(entry["key"], entry["value"]) for entry in entries or []]
            try:
                pairs.sort(key=lambda pair: (-pair[1], pair[0]))
            except TypeError:
                pairs.sort(key=lambda pair: (-pair[1], str(pair[0])))
            result[name] = [
                {"value": json_value(value), "count": count} for value, count in pairs[: int(top_n)]
            ]
        return result

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
                return json_value(value)
        return str(value)

    def get_histogram(self, model_name: str, column: str, bins: int = 20) -> Dict[str, Any]:
        """Bucket counts for a numeric column, top values for any other;
        ``bins`` is clamped to 5-100."""
        bins = max(5, min(100, bins))

        parquet_path = self.get_parquet_path(model_name)
        if not os.path.exists(parquet_path):
            raise FileNotFoundError(f"Parquet file not found for model: {model_name}")

        conn = None
        try:
            conn = duckdb.connect(":memory:")
            escaped_path = parquet_path.replace("'", "''")

            schema_result = conn.execute(
                f"DESCRIBE SELECT * FROM read_parquet('{escaped_path}')"
            ).fetchall()

            column_type = None
            escaped_column = self._identifier(column)

            for row in schema_result:
                if row[0] == column:
                    column_type = row[1]
                    break

            if column_type is None:
                raise ValueError(f"Column '{column}' not found in model '{model_name}'")

            if is_numeric(column_type):
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
        stats_query = f"""
            SELECT MIN({escaped_column}), MAX({escaped_column}), COUNT(*)
            FROM read_parquet('{escaped_path}')
            WHERE {escaped_column} IS NOT NULL
        """
        stats = conn.execute(stats_query).fetchone()
        min_val, max_val, total_count = stats

        if min_val is None or max_val is None or min_val == max_val:
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

        bucket_width = (float(max_val) - float(min_val)) / bins
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
        histogram_query = f"""
            SELECT {escaped_column} as value, COUNT(*) as count
            FROM read_parquet('{escaped_path}')
            WHERE {escaped_column} IS NOT NULL
            GROUP BY {escaped_column}
            ORDER BY count DESC
            LIMIT {bins}
        """
        result = conn.execute(histogram_query).fetchall()

        total_query = f"""
            SELECT COUNT(*) FROM read_parquet('{escaped_path}')
            WHERE {escaped_column} IS NOT NULL
        """
        total_count = conn.execute(total_query).fetchone()[0]

        buckets = [{"value": json_value(value), "count": count} for value, count in result]

        return {
            "model_name": model_name,
            "column": column,
            "column_type": column_type,
            "buckets": buckets,
            "total_count": total_count,
        }

    def invalidate_cache(self, model_name: str) -> None:
        cache_key = f"tier2_{model_name}"
        self._cache.pop(cache_key, None)
        self._cache_timestamps.pop(cache_key, None)

    def _is_cache_valid(self, cache_key: str) -> bool:
        if cache_key not in self._cache or cache_key not in self._cache_timestamps:
            return False
        return time.time() - self._cache_timestamps[cache_key] < CACHE_TTL_SECONDS
