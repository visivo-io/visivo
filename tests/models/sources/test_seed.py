"""Tests for Seed CSV validation and the ServerSource-only placement of `seeds`."""

import io

import pytest
from click import ClickException
from pydantic import ValidationError

from visivo.models.sources.csv_source import CSVFileSource
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.sources.excel_source import ExcelFileSource
from visivo.models.sources.seed import Seed
from visivo.models.sources.sqlite_source import SqliteSource


class TestSeedCsvValidation:
    def test_valid_csv_passes(self):
        seed = Seed(table_name="t", args=["echo"])
        seed.validate_stream_is_csv(io.StringIO("x,y\n1,2\n3,4"))

    def test_empty_csv_raises(self):
        seed = Seed(table_name="t", args=["echo"])
        with pytest.raises(ClickException) as exc_info:
            seed.validate_stream_is_csv(io.StringIO("   "))
        assert "did not return any data" in str(exc_info.value)

    def test_empty_csv_allowed_when_allow_empty(self):
        seed = Seed(table_name="t", args=["echo"], allow_empty=True)
        seed.validate_stream_is_csv(io.StringIO(""))

    def test_ragged_rows_raise(self):
        seed = Seed(table_name="t", args=["echo"])
        with pytest.raises(ClickException) as exc_info:
            seed.validate_stream_is_csv(io.StringIO("x,y\n1,2\n3,4,5"))
        assert "Row 3 has 3 columns but expected 2" in str(exc_info.value)

    def test_blank_lines_are_skipped(self):
        seed = Seed(table_name="t", args=["echo"])
        seed.validate_stream_is_csv(io.StringIO("x,y\n1,2\n\n3,4\n"))

    def test_stream_is_rewound_for_the_reader(self):
        seed = Seed(table_name="t", args=["echo"])
        stream = io.StringIO("x,y\n1,2")
        seed.validate_stream_is_csv(stream)
        assert stream.read() == "x,y\n1,2"

    def test_table_name_is_required(self):
        with pytest.raises(ValidationError):
            Seed(args=["echo"])


class TestSeedPlacement:
    """`seeds` lives on ServerSource so file sources cannot silently discard a load."""

    @pytest.mark.parametrize(
        "source_factory",
        [
            lambda seeds: DuckdbSource(
                name="d", type="duckdb", database="target/t.duckdb", seeds=seeds
            ),
            lambda seeds: SqliteSource(name="s", type="sqlite", database="t.db", seeds=seeds),
        ],
    )
    def test_database_sources_accept_seeds(self, source_factory):
        source = source_factory([{"table_name": "raw", "args": ["echo", "x"]}])
        assert [seed.table_name for seed in source.seeds] == ["raw"]

    def test_database_sources_default_to_no_seeds(self):
        assert DuckdbSource(name="d", type="duckdb", database="target/t.duckdb").seeds == []

    @pytest.mark.parametrize(
        "source_factory",
        [
            lambda seeds: CSVFileSource(name="c", type="csv", file="data.csv", seeds=seeds),
            lambda seeds: ExcelFileSource(name="x", type="xls", file="data.xlsx", seeds=seeds),
        ],
    )
    def test_file_sources_reject_seeds(self, source_factory):
        """A file source builds a throwaway in-memory connection, so a seed there
        would vanish. `extra="forbid"` is what makes that unexpressible."""
        with pytest.raises(ValidationError) as exc_info:
            source_factory([{"table_name": "raw", "args": ["echo", "x"]}])
        assert "seeds" in str(exc_info.value)
