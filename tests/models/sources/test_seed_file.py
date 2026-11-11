"""File seeds: `file:` with DuckDB's native readers (VIS-1282)."""

import duckdb
import pytest
from click import ClickException
from pydantic import ValidationError

from visivo.jobs.run_source_schema_job import run_seeds
from visivo.models.sources.base_duckdb_source import BaseDuckdbSource
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.sources.excel_source import ExcelFileSource
from visivo.models.sources.seed import Seed
from visivo.models.sources.sqlite_source import SqliteSource


@pytest.fixture
def project(tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    connection = duckdb.connect()
    connection.execute("INSTALL excel")
    connection.execute("LOAD excel")
    connection.execute(
        "COPY (SELECT * FROM (VALUES (DATE '2026-01-31', 'travel', 120.5), "
        "(DATE '2026-02-28', 'rent', 900.0)) t(month, account, amount)) "
        f"TO '{data}/gl_jan.csv'"
    )
    connection.execute(
        "COPY (SELECT DATE '2026-03-31' AS month, 'travel' AS account, 80.25 AS amount) "
        f"TO '{data}/gl_mar.csv'"
    )
    connection.execute(
        "COPY (SELECT * FROM (VALUES ('travel', 1000), ('rent', 10000)) t(account, budget)) "
        f"TO '{data}/budget.xlsx' (FORMAT xlsx, HEADER true)"
    )
    connection.execute(
        "COPY (SELECT 'west' AS region, 12::INTEGER AS units) " f"TO '{data}/ev_1.parquet'"
    )
    connection.execute(
        "COPY (SELECT 'east' AS region, 7::INTEGER AS units) " f"TO '{data}/ev_2.parquet'"
    )
    connection.close()
    return tmp_path


def duckdb_source(project, seeds):
    return DuckdbSource(
        name="local",
        type="duckdb",
        database=str(project / "target" / "local.duckdb"),
        seeds=seeds,
    )


def columns(source, table):
    return [
        (row["column_name"], row["data_type"])
        for row in source.read_sql(
            "SELECT column_name, data_type FROM information_schema.columns "
            f"WHERE table_name = '{table}' ORDER BY ordinal_position"
        )
    ]


class TestFileSeedModel:
    @pytest.mark.parametrize(
        "file,table_name",
        [
            ("data/budget.xlsx", "budget"),
            ("data/gl_*.csv", "gl"),
            ("files/Sales Report.v2.csv", "sales_report"),
            ("2026-orders.parquet", "t_2026_orders"),
        ],
    )
    def test_table_name_defaults_to_the_file_stem(self, file, table_name):
        assert Seed(file=file).table_name == table_name

    def test_an_explicit_table_name_wins(self):
        assert Seed(file="data/budget.xlsx", table_name="plan").table_name == "plan"

    def test_a_stem_with_no_letters_needs_a_table_name(self):
        with pytest.raises(ValidationError, match="Set `table_name`"):
            Seed(file="data/*.csv")

    @pytest.mark.parametrize("fields", [{}, {"args": ["echo"], "file": "a.csv"}])
    def test_needs_exactly_one_of_args_or_file(self, fields):
        with pytest.raises(ValidationError, match="exactly one of `args` or `file`"):
            Seed(table_name="t", **fields)

    def test_command_seeds_still_need_a_table_name(self):
        with pytest.raises(ValidationError, match="needs a `table_name`"):
            Seed(args=["echo"])

    @pytest.mark.parametrize(
        "file,expected",
        [
            ("a.csv", "csv"),
            ("a.TSV", "csv"),
            ("a.parquet", "parquet"),
            ("a.ndjson", "json"),
            ("a.xlsx", "xlsx"),
        ],
    )
    def test_format_comes_from_the_extension(self, file, expected):
        assert Seed(file=file).file_format() == expected

    def test_format_overrides_the_extension(self):
        assert Seed(file="export.dat", table_name="t", format="csv").file_format() == "csv"

    @pytest.mark.parametrize("file", ["export.dat", "old.xls"])
    def test_an_unknown_extension_needs_a_format(self, file):
        with pytest.raises(ValidationError, match="Set `format`"):
            Seed(file=file, table_name="t")

    @pytest.mark.parametrize(
        "fields,message",
        [
            ({"file": "a.parquet", "delimiter": ";"}, "`delimiter` applies only to CSV"),
            ({"file": "a.json", "has_header": True}, "`has_header` applies only"),
            ({"file": "a.csv", "sheet": "One"}, "`sheet` applies only to Excel"),
            ({"file": "a.xlsx", "union_by_name": True}, "`union_by_name` does not apply"),
            ({"args": ["echo"], "table_name": "t", "sheet": "One"}, "only to `file` seeds"),
        ],
    )
    def test_format_hints_must_fit_the_format(self, fields, message):
        with pytest.raises(ValidationError, match=message):
            Seed(**fields)

    def test_reader_sql_uses_the_native_reader_and_escapes_values(self):
        assert Seed(file="a.csv").reader_sql("/p/o'brien.csv") == "read_csv('/p/o''brien.csv')"
        assert Seed(file="a.tsv").reader_sql("/p/a.tsv") == "read_csv('/p/a.tsv', delim = '\t')"
        assert (
            Seed(file="a.csv", delimiter=";", has_header=False, union_by_name=True).reader_sql(
                "/p/*.csv"
            )
            == "read_csv('/p/*.csv', delim = ';', header = false, union_by_name = true)"
        )
        assert (
            Seed(file="a.xlsx", sheet="FY'26").reader_sql("/p/a.xlsx")
            == "read_xlsx('/p/a.xlsx', sheet = 'FY''26')"
        )
        assert Seed(file="a.parquet").reader_sql("/p/a.parquet") == "read_parquet('/p/a.parquet')"
        assert Seed(file="a.jsonl").reader_sql("/p/a.jsonl") == "read_json('/p/a.jsonl')"


class TestFileSeedLoading:
    def test_globs_excel_and_parquet_load_into_typed_tables_that_join(self, project):
        source = duckdb_source(
            project,
            [
                {"file": "data/gl_*.csv"},
                {"table_name": "budget", "file": "data/budget.xlsx"},
                {"table_name": "ev", "file": "data/*.parquet"},
            ],
        )

        assert run_seeds(source, working_dir=str(project)) == 3

        assert columns(source, "gl") == [
            ("month", "DATE"),
            ("account", "VARCHAR"),
            ("amount", "DOUBLE"),
        ]
        assert columns(source, "budget") == [("account", "VARCHAR"), ("budget", "DOUBLE")]
        assert columns(source, "ev") == [("region", "VARCHAR"), ("units", "INTEGER")]
        assert source.read_sql(
            "SELECT g.account, sum(g.amount) AS spent, any_value(b.budget) AS budget "
            "FROM gl g JOIN budget b USING (account) GROUP BY 1 ORDER BY 1"
        ) == [
            {"account": "rent", "spent": 900.0, "budget": 10000.0},
            {"account": "travel", "spent": 200.75, "budget": 1000.0},
        ]

    def test_excel_loads_without_the_csv_reader(self, project, monkeypatch):
        executed = []
        original_connect = BaseDuckdbSource.connect

        class Recording:
            def __init__(self, inner):
                self.inner = inner

            def __enter__(self):
                connection = self.inner.__enter__()

                class Proxy:
                    def execute(self, sql, *args):
                        executed.append(sql)
                        return connection.execute(sql, *args)

                    def __getattr__(self, name):
                        return getattr(connection, name)

                return Proxy()

            def __exit__(self, *exc):
                return self.inner.__exit__(*exc)

        monkeypatch.setattr(
            BaseDuckdbSource,
            "connect",
            lambda self, **kwargs: Recording(original_connect(self, **kwargs)),
        )
        source = duckdb_source(project, [{"file": "data/budget.xlsx"}])

        run_seeds(source, working_dir=str(project))

        loads = [sql for sql in executed if "budget.xlsx" in sql]
        assert loads and all("read_xlsx(" in sql for sql in loads)
        assert not any("read_csv" in sql for sql in executed)

    def test_relative_paths_resolve_against_the_working_dir(
        self, project, tmp_path_factory, monkeypatch
    ):
        monkeypatch.chdir(tmp_path_factory.mktemp("elsewhere"))
        source = duckdb_source(project, [{"file": "data/budget.xlsx"}])

        run_seeds(source, working_dir=str(project))

        assert source.read_sql("SELECT count(*) AS c FROM budget") == [{"c": 2}]

    def test_a_missing_file_fails_with_its_path(self, project):
        source = duckdb_source(project, [{"file": "data/missing_*.csv", "table_name": "m"}])

        with pytest.raises(ClickException, match="no file matches 'data/missing_\\*.csv'"):
            run_seeds(source, working_dir=str(project))

    def test_allow_empty_skips_a_missing_file(self, project):
        source = duckdb_source(
            project, [{"file": "data/missing.csv", "table_name": "m", "allow_empty": True}]
        )

        run_seeds(source, working_dir=str(project))

        assert not source.table_exists("m")

    def test_existing_table_modes_apply_to_file_seeds(self, project):
        def seeded(mode):
            source = duckdb_source(
                project, [{"file": "data/gl_mar.csv", "table_name": "gl", "existing_table": mode}]
            )
            run_seeds(source, working_dir=str(project))
            return source.read_sql("SELECT count(*) AS c FROM gl")[0]["c"]

        assert seeded("skip") == 1
        assert seeded("skip") == 1
        assert seeded("append") == 2
        assert seeded("overwrite") == 1

    def test_append_matches_columns_by_name(self, project):
        (project / "data" / "reordered.csv").write_text(
            "amount,account,month\n5.0,misc,2026-04-30\n"
        )
        source = duckdb_source(
            project,
            [
                {"file": "data/gl_mar.csv", "table_name": "gl"},
                {"file": "data/reordered.csv", "table_name": "gl", "existing_table": "append"},
            ],
        )

        run_seeds(source, working_dir=str(project))

        assert source.read_sql("SELECT account, amount FROM gl ORDER BY month") == [
            {"account": "travel", "amount": 80.25},
            {"account": "misc", "amount": 5.0},
        ]

    def test_other_sources_load_through_write_dataframe(self, project):
        source = SqliteSource(
            name="lite",
            type="sqlite",
            database=str(project / "lite.db"),
            seeds=[{"file": "data/*.parquet", "table_name": "ev"}],
        )

        run_seeds(source, working_dir=str(project))

        assert source.read_sql("SELECT region, units FROM ev ORDER BY units") == [
            {"region": "east", "units": 7},
            {"region": "west", "units": 12},
        ]


class TestExcelFileSource:
    def test_reads_a_real_workbook_with_its_types(self, project):
        source = ExcelFileSource(
            name="budget_xls", type="xls", file=str(project / "data/budget.xlsx")
        )

        assert source.read_sql("SELECT * FROM budget_xls ORDER BY budget") == [
            {"account": "travel", "budget": 1000.0},
            {"account": "rent", "budget": 10000.0},
        ]

    def test_reads_the_named_sheet(self, project):
        path = project / "data" / "book.xlsx"
        connection = duckdb.connect()
        connection.execute("LOAD excel")
        connection.execute(
            f"COPY (SELECT 'q1' AS quarter) TO '{path}' (FORMAT xlsx, HEADER true, SHEET 'FY26')"
        )
        connection.close()
        source = ExcelFileSource(name="book", type="xls", file=str(path), sheet="FY26")

        assert source.read_sql("SELECT * FROM book") == [{"quarter": "q1"}]
