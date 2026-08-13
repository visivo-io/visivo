"""Tests for seeding inside the source schema job.

The ordering assertion here is the load-bearing one: seeds must land *before*
``get_schema()`` runs, or the seeded tables are invisible to schema introspection
and every model that queries them fails to resolve its columns.
"""

import pytest
from click import ClickException

from visivo.jobs.run_source_schema_job import action, run_seeds
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.sources.seed import Seed
from tests.support.utils import temp_folder


def seeded_source(seeds=None, name="seed_source"):
    output_dir = temp_folder()
    return DuckdbSource(
        name=name,
        type="duckdb",
        database=f"{output_dir}/{name}.duckdb",
        seeds=seeds or [],
    )


class TestRunSeeds:
    def test_loads_a_seed_into_its_table(self):
        source = seeded_source([Seed(table_name="raw", args=["echo", "x,y\n1,2\n3,4"])])
        assert run_seeds(source) == 1
        assert source.read_sql("select count(*) as c from raw") == [{"c": 2}]

    def test_each_seed_lands_in_its_own_table(self):
        source = seeded_source(
            [
                Seed(table_name="first", args=["echo", "x\n1"]),
                Seed(table_name="second", args=["echo", "y\n2\n3"]),
            ]
        )
        assert run_seeds(source) == 2
        assert source.read_sql("select count(*) as c from first") == [{"c": 1}]
        assert source.read_sql("select count(*) as c from second") == [{"c": 2}]

    def test_reruns_skip_when_table_present_by_default(self):
        # overwrite_if_present defaults False: a second seed over the same database
        # with different data must NOT overwrite an already-present table.
        source = seeded_source([Seed(table_name="raw", args=["echo", "x\n1\n2"])])
        run_seeds(source)
        rerun = DuckdbSource(
            name="rerun",
            type="duckdb",
            database=source.database,
            seeds=[Seed(table_name="raw", args=["echo", "x\n9\n9\n9"])],
        )
        run_seeds(rerun)
        assert source.read_sql("select count(*) as c from raw") == [{"c": 2}]  # unchanged

    def test_existing_table_overwrite_reloads_an_existing_table(self):
        source = seeded_source([Seed(table_name="raw", args=["echo", "x\n1\n2"])])
        run_seeds(source)
        rerun = DuckdbSource(
            name="rerun",
            type="duckdb",
            database=source.database,
            seeds=[
                Seed(
                    table_name="raw",
                    args=["echo", "x\n9\n9\n9"],
                    existing_table="overwrite",
                )
            ],
        )
        run_seeds(rerun)
        assert source.read_sql("select count(*) as c from raw") == [{"c": 3}]  # replaced

    def test_existing_table_append_adds_to_an_existing_table(self):
        source = seeded_source([Seed(table_name="raw", args=["echo", "x\n1\n2"])])
        run_seeds(source)
        rerun = DuckdbSource(
            name="rerun",
            type="duckdb",
            database=source.database,
            seeds=[
                Seed(
                    table_name="raw",
                    args=["echo", "x\n3\n4"],
                    existing_table="append",
                )
            ],
        )
        run_seeds(rerun)
        # 2 original + 2 appended rows.
        assert source.read_sql("select count(*) as c from raw") == [{"c": 4}]

    def test_table_exists_is_false_before_and_true_after_a_seed(self):
        source = seeded_source([Seed(table_name="raw", args=["echo", "x\n1"])])
        assert source.table_exists("raw") is False  # no database file yet
        run_seeds(source)
        assert source.table_exists("raw") is True
        assert source.table_exists("never_seeded") is False

    def test_a_source_without_seeds_is_a_no_op(self):
        assert run_seeds(seeded_source()) == 0

    def test_failing_command_raises(self):
        source = seeded_source([Seed(table_name="raw", args=["false"])])
        with pytest.raises(ClickException) as exc_info:
            run_seeds(source)
        assert "failed with return code" in str(exc_info.value)

    def test_invalid_csv_raises(self):
        source = seeded_source([Seed(table_name="raw", args=["echo", "x,y\n1,2,3"])])
        with pytest.raises(ClickException) as exc_info:
            run_seeds(source)
        assert "expected 2" in str(exc_info.value)

    def test_empty_output_raises_unless_allowed(self):
        source = seeded_source([Seed(table_name="raw", args=["echo", "-n", ""])])
        with pytest.raises(ClickException) as exc_info:
            run_seeds(source)
        assert "did not return any data" in str(exc_info.value)

    def test_empty_output_allowed_writes_nothing(self):
        source = seeded_source([Seed(table_name="raw", args=["echo", "-n", ""], allow_empty=True)])
        assert run_seeds(source) == 1
        with pytest.raises(Exception):
            source.read_sql("select count(*) from raw")

    def test_working_dir_is_honoured_for_relative_commands(self, tmp_path):
        (tmp_path / "data.csv").write_text("x,y\n1,2\n3,4\n5,6\n")
        source = seeded_source([Seed(table_name="raw", args=["cat", "data.csv"])])

        run_seeds(source, working_dir=str(tmp_path))

        assert source.read_sql("select count(*) as c from raw") == [{"c": 3}]


class TestSourceSchemaAction:
    def test_seeded_tables_are_visible_to_schema_introspection(self):
        """Seeds run before get_schema(), so their tables appear in the schema."""
        source = seeded_source([Seed(table_name="seeded_table", args=["echo", "x,y\n1,2"])])

        result = action(source_to_build=source, output_dir=temp_folder())

        assert result.success, result.message
        assert "seeded_table" in source.get_schema()["tables"]

    def test_seed_count_is_reported(self):
        source = seeded_source(
            [
                Seed(table_name="a", args=["echo", "x\n1"]),
                Seed(table_name="b", args=["echo", "x\n1"]),
            ]
        )
        result = action(source_to_build=source, output_dir=temp_folder())
        assert "2 seeds" in result.message

    def test_a_failing_seed_fails_the_job(self):
        source = seeded_source([Seed(table_name="raw", args=["false"])])
        result = action(source_to_build=source, output_dir=temp_folder())
        assert not result.success


class TestSchemaBuildOutcomes:
    """Three outcomes, because two were not enough.

    Downstream jobs cannot run without a schema — SQLGlot needs it to expand
    ``SELECT *``, and without it a model's only column is a literal ``*`` of
    unknown type. So "connected but resolved nothing" has to fail HERE, next to
    the evidence, rather than surfacing later as "Column 'id' not found" on a
    job that is not the cause.

    But a partial schema is genuinely useful, and an empty database is not an
    error at all.
    """

    @staticmethod
    def _sqlite_with(tables):
        import sqlite3

        import os

        output_dir = temp_folder()
        # temp_folder() only names a path; sqlite will not create the parent.
        os.makedirs(output_dir, exist_ok=True)
        path = f"{output_dir}/s.db"
        connection = sqlite3.connect(path)
        for i in range(tables):
            connection.execute(f"CREATE TABLE t{i} (a INT, b INT)")
        connection.commit()
        connection.close()
        from visivo.models.sources.sqlite_source import SqliteSource

        return output_dir, SqliteSource(name="s", type="sqlite", database=path)

    @staticmethod
    def _deny_all_reflection(monkeypatch):
        from sqlalchemy.engine.reflection import Inspector

        def deny(self, *args, **kwargs):
            raise PermissionError("permission denied for table pg_collation")

        monkeypatch.setattr(Inspector, "get_multi_columns", deny)
        monkeypatch.setattr(Inspector, "get_columns", deny)

    def test_resolving_no_tables_fails_even_though_the_connection_worked(self, monkeypatch):
        output_dir, source = self._sqlite_with(3)
        self._deny_all_reflection(monkeypatch)

        result = action(source_to_build=source, output_dir=output_dir)

        assert not result.success
        assert "No schema could be read" in result.message
        # The reason travels with the failure rather than being left for a
        # downstream job to misreport.
        assert "pg_collation" in result.message

    def test_an_empty_database_is_not_a_failure(self):
        # Nothing to read and nothing went wrong: an honest empty answer. A
        # model that needs a table it does not have will say so itself.
        output_dir, source = self._sqlite_with(0)

        result = action(source_to_build=source, output_dir=output_dir)

        assert result.success

    def test_a_partial_build_still_succeeds(self, monkeypatch):
        """The whole point of not failing on the first problem."""
        from sqlalchemy.engine.reflection import Inspector

        output_dir, source = self._sqlite_with(2)
        real = Inspector.get_multi_columns

        def one_bad_column(self, **kwargs):
            reflected = real(self, **kwargs)

            class Unmappable:
                def __str__(self):
                    raise Exception("Can't generate DDL for NullType()")

            return {
                key: [{**c, "type": Unmappable()} if c["name"] == "b" else c for c in cols]
                for key, cols in reflected.items()
            }

        monkeypatch.setattr(Inspector, "get_multi_columns", one_bad_column)

        result = action(source_to_build=source, output_dir=output_dir)

        assert result.success
        assert "WARNING" in result.message
