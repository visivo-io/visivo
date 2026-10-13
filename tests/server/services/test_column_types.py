"""One classifier for DuckDB type spellings, shared by the profiler and the
shape cards."""

import datetime
from decimal import Decimal

import pytest

from visivo.server.services.column_types import column_kind, is_numeric, json_value


class TestColumnKind:
    @pytest.mark.parametrize(
        "spelling, kind",
        [
            ("INTEGER", "integer"),
            ("INT", "integer"),
            ("BIGINT", "integer"),
            ("SMALLINT", "integer"),
            ("TINYINT", "integer"),
            ("HUGEINT", "integer"),
            ("UBIGINT", "integer"),
            ("UINTEGER", "integer"),
            ("USMALLINT", "integer"),
            ("UTINYINT", "integer"),
            ("DECIMAL(18,3)", "float"),
            ("NUMERIC", "float"),
            ("DOUBLE", "float"),
            ("FLOAT", "float"),
            ("REAL", "float"),
            ("VARCHAR", "text"),
            ("TEXT", "text"),
            ("STRING", "text"),
            ("BOOLEAN", "boolean"),
            ("BOOL", "boolean"),
            ("TIMESTAMP", "time"),
            ("TIMESTAMP WITH TIME ZONE", "time"),
            ("TIMESTAMPTZ", "time"),
            ("TIMESTAMP_NS", "time"),
            ("DATETIME", "time"),
            ("DATE", "time"),
            ("TIME", "time"),
            ("UUID", "other"),
            ("BLOB", "other"),
            ("INTERVAL", "other"),
            ("VARCHAR[]", "other"),
            ("STRUCT(a INTEGER)", "other"),
            ("MAP(VARCHAR, INTEGER)", "other"),
        ],
    )
    def test_duckdb_spellings(self, spelling, kind):
        assert column_kind(spelling) == kind
        assert column_kind(spelling.lower()) == kind

    def test_unparseable_types_are_other(self):
        assert column_kind(None) == "other"
        assert column_kind("") == "other"
        assert column_kind("NOT A TYPE AT ALL (") == "other"

    def test_is_numeric(self):
        assert is_numeric("HUGEINT") and is_numeric("DECIMAL(2,1)")
        assert not is_numeric("VARCHAR") and not is_numeric("BOOLEAN")


class TestJsonValue:
    def test_native_values_pass_through(self):
        for value in (None, True, 3, 1.5, "text", [1, "a"], {"k": 1}):
            assert json_value(value) is value

    def test_nan_dates_decimals_and_objects(self):
        assert json_value(float("nan")) is None
        assert json_value(datetime.date(2024, 1, 2)) == "2024-01-02"
        assert json_value(datetime.datetime(2024, 1, 2, 3, 4)) == "2024-01-02T03:04:00"
        assert json_value(Decimal("1.5")) == 1.5
        assert json_value(object()).startswith("<object")
        assert json_value(b"raw") == "b'raw'"
