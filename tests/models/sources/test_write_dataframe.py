"""Tests for Source.write_dataframe across the DuckDB and SQLAlchemy implementations."""

import datetime

import polars as pl
import pytest
from click import ClickException

from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.sources.sqlite_source import SqliteSource


@pytest.fixture
def data_frame():
    return pl.DataFrame(
        {
            "i": [1, 2, 3],
            "f": [1.5, 2.5, 3.5],
            "s": ["a", "b", "c"],
            "b": [True, False, True],
            "d": [datetime.date(2024, 1, 1)] * 3,
        }
    )


def duckdb_source(tmp_path):
    return DuckdbSource(name="d", type="duckdb", database=f"{tmp_path}/t.duckdb")


def sqlite_source(tmp_path):
    return SqliteSource(name="s", type="sqlite", database=f"{tmp_path}/t.db")


@pytest.fixture(params=[duckdb_source, sqlite_source], ids=["duckdb", "sqlite"])
def source(request, tmp_path):
    return request.param(tmp_path)


class TestWriteDataframe:
    def test_creates_the_table(self, source, data_frame):
        source.write_dataframe("raw", data_frame)
        assert source.read_sql("select count(*) as c from raw") == [{"c": 3}]

    def test_replace_does_not_accumulate_rows(self, source, data_frame):
        source.write_dataframe("raw", data_frame)
        source.write_dataframe("raw", data_frame)
        assert source.read_sql("select count(*) as c from raw") == [{"c": 3}]

    def test_append_accumulates_rows(self, source, data_frame):
        source.write_dataframe("raw", data_frame)
        source.write_dataframe("raw", data_frame, replace=False)
        assert source.read_sql("select count(*) as c from raw") == [{"c": 6}]

    def test_values_round_trip(self, source, data_frame):
        source.write_dataframe("raw", data_frame)
        row = source.read_sql("select i, f, s from raw order by i")[0]
        assert (row["i"], row["f"], row["s"]) == (1, 1.5, "a")

    def test_empty_dataframe_creates_an_empty_table(self, source):
        source.write_dataframe("raw", pl.DataFrame({"i": [], "s": []}))
        assert source.read_sql("select count(*) as c from raw") == [{"c": 0}]

    def test_replace_accommodates_a_changed_schema(self, source):
        source.write_dataframe("raw", pl.DataFrame({"a": [1]}))
        source.write_dataframe("raw", pl.DataFrame({"b": ["x"], "c": ["y"]}))
        assert source.read_sql("select b, c from raw") == [{"b": "x", "c": "y"}]

    def test_nested_columns_do_not_fail_the_write(self, source):
        """List/struct columns have no portable SQL type. DuckDB stores them
        natively; the SQLAlchemy path stringifies them. Either way one nested
        column must not take down the whole seed."""
        source.write_dataframe("raw", pl.DataFrame({"tags": [["a", "b"], ["c"]]}))
        assert source.read_sql("select count(*) as c from raw") == [{"c": 2}]
