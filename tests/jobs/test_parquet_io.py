"""Tests for visivo.jobs.parquet_io.write_dicts_to_parquet.

Covers regressions B12 (null-heavy schema inference) and B14 (decimal128
serialization).

Diagnostic files:
    specs/plan/v1-final-bugfixes/B12-polars-infer-schema-length.md
    specs/plan/v1-final-bugfixes/B14-arrow-decimal128-object-serialization.md
"""

from datetime import datetime, date
from decimal import Decimal

import polars as pl
import pytest

from visivo.jobs.parquet_io import write_dicts_to_parquet


# ---------------------------------------------------------------------------
# B14: Decimal columns are cast to Float64 before parquet write
# ---------------------------------------------------------------------------


def test_single_decimal_column_cast_to_float64(tmp_path):
    parquet_path = tmp_path / "out.parquet"
    data = [{"v": Decimal("0.714646")}, {"v": Decimal("1.5")}]
    write_dicts_to_parquet(data, str(parquet_path))

    df = pl.read_parquet(parquet_path)
    assert df.schema["v"] == pl.Float64
    values = df["v"].to_list()
    assert values[0] == pytest.approx(0.714646)
    assert values[1] == pytest.approx(1.5)


def test_multiple_decimal_columns_cast(tmp_path):
    parquet_path = tmp_path / "out.parquet"
    data = [
        {"a": Decimal("1.1"), "b": Decimal("2.2"), "c": Decimal("3.3")},
        {"a": Decimal("4.4"), "b": Decimal("5.5"), "c": Decimal("6.6")},
    ]
    write_dicts_to_parquet(data, str(parquet_path))

    df = pl.read_parquet(parquet_path)
    for col in ("a", "b", "c"):
        assert df.schema[col] == pl.Float64


def test_precision_within_float64_limits(tmp_path):
    parquet_path = tmp_path / "out.parquet"
    # 9 significant digits — well within Float64's ~15
    data = [{"v": Decimal("1234567.89")}]
    write_dicts_to_parquet(data, str(parquet_path))

    df = pl.read_parquet(parquet_path)
    assert df["v"].to_list()[0] == pytest.approx(1234567.89, rel=1e-9)


def test_non_decimal_columns_unchanged(tmp_path):
    parquet_path = tmp_path / "out.parquet"
    data = [
        {"name": "alice", "age": 30, "active": True},
        {"name": "bob", "age": 25, "active": False},
    ]
    write_dicts_to_parquet(data, str(parquet_path))

    df = pl.read_parquet(parquet_path)
    assert df.schema["name"] == pl.String
    assert df.schema["age"] == pl.Int64
    assert df.schema["active"] == pl.Boolean


def test_mixed_decimal_and_non_decimal(tmp_path):
    parquet_path = tmp_path / "out.parquet"
    data = [
        {"label": "x", "value": Decimal("0.5"), "count": 10},
        {"label": "y", "value": Decimal("0.25"), "count": 20},
    ]
    write_dicts_to_parquet(data, str(parquet_path))

    df = pl.read_parquet(parquet_path)
    assert df.schema["label"] == pl.String
    assert df.schema["value"] == pl.Float64
    assert df.schema["count"] == pl.Int64


# ---------------------------------------------------------------------------
# B12: null-heavy columns must be inferred from full dataset, not first 100 rows
# ---------------------------------------------------------------------------


def test_null_heavy_column_handled(tmp_path):
    """
    Reproduces B12: a column whose first 200 rows are NULL and only later
    rows have data with a non-trivial type. With infer_schema_length=100
    (polars default) this raises ComputeError. With None it succeeds.
    """
    parquet_path = tmp_path / "out.parquet"
    data = [{"sparse_col": None, "stable": i} for i in range(200)]
    data.extend([{"sparse_col": f"value-{i}", "stable": 200 + i} for i in range(50)])
    # No exception expected.
    write_dicts_to_parquet(data, str(parquet_path))

    df = pl.read_parquet(parquet_path)
    assert df.height == 250
    assert df["sparse_col"].null_count() == 200


def test_null_heavy_datetime_column(tmp_path):
    parquet_path = tmp_path / "out.parquet"
    data = [{"event_time": None} for _ in range(150)]
    data.append({"event_time": datetime(2026, 4, 25, 12, 0, 0)})

    write_dicts_to_parquet(data, str(parquet_path))

    df = pl.read_parquet(parquet_path)
    assert df.height == 151
    # The single non-null value should round-trip as a datetime.
    assert df["event_time"][-1] == datetime(2026, 4, 25, 12, 0, 0)


def test_null_heavy_date_column(tmp_path):
    parquet_path = tmp_path / "out.parquet"
    data = [{"d": None} for _ in range(150)]
    data.append({"d": date(2026, 4, 25)})

    write_dicts_to_parquet(data, str(parquet_path))

    df = pl.read_parquet(parquet_path)
    assert df.height == 151
    assert df["d"][-1] == date(2026, 4, 25)


# ---------------------------------------------------------------------------
# Integration: data round-trips
# ---------------------------------------------------------------------------


def test_empty_dict_list_writes_empty_parquet(tmp_path):
    parquet_path = tmp_path / "out.parquet"
    # Empty list should still produce a parquet (with zero rows).
    write_dicts_to_parquet([], str(parquet_path))

    df = pl.read_parquet(parquet_path)
    assert df.height == 0


def test_single_row_round_trip(tmp_path):
    parquet_path = tmp_path / "out.parquet"
    data = [{"a": 1, "b": "two", "c": Decimal("3.14")}]
    write_dicts_to_parquet(data, str(parquet_path))

    df = pl.read_parquet(parquet_path)
    assert df.height == 1
    assert df["a"][0] == 1
    assert df["b"][0] == "two"
    assert df["c"][0] == pytest.approx(3.14)
