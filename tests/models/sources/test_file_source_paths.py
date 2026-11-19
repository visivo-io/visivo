import duckdb
import pytest

from visivo.models.sources.csv_source import CSVFileSource
from visivo.models.sources.excel_source import ExcelFileSource


def _count(source):
    return source.read_sql(f"SELECT count(*) AS n FROM {source._quote_table(source.name)}")[0]["n"]


def _write_csv(path, rows):
    path.write_text("a,b\n" + "".join(f"{i},{i}\n" for i in range(rows)))


def _write_xlsx(path, rows):
    connection = duckdb.connect()
    connection.execute("INSTALL excel")
    connection.execute("LOAD excel")
    target = str(path).replace("'", "''")
    connection.execute(
        f"COPY (SELECT range AS a FROM range({rows})) TO '{target}' (FORMAT xlsx, HEADER true)"
    )
    connection.close()


SOURCES = {
    "csv": (CSVFileSource, _write_csv),
    "xls": (ExcelFileSource, _write_xlsx),
}


@pytest.mark.parametrize("type_", SOURCES)
@pytest.mark.parametrize("stem", ["it's", 'say "hi"', "sp ace ü", "50%", "back\\slash", "{a,b}"])
def test_a_file_with_an_odd_name_is_read(tmp_path, type_, stem):
    model, write = SOURCES[type_]
    extension = "csv" if type_ == "csv" else "xlsx"
    write(tmp_path / f"{stem}.{extension}", 2)

    source = model(name="odd", type=type_, file=str(tmp_path / f"{stem}.{extension}"))

    assert _count(source) == 2


@pytest.mark.parametrize("type_", SOURCES)
@pytest.mark.parametrize(
    "stem, sibling", [("sales[1]", "sales1"), ("star*", "star-2"), ("q?", "qx")]
)
def test_glob_characters_in_a_name_read_only_that_file(tmp_path, type_, stem, sibling):
    model, write = SOURCES[type_]
    extension = "csv" if type_ == "csv" else "xlsx"
    write(tmp_path / f"{stem}.{extension}", 2)
    write(tmp_path / f"{sibling}.{extension}", 5)

    source = model(name="odd", type=type_, file=str(tmp_path / f"{stem}.{extension}"))

    assert _count(source) == 2


def test_quotes_in_a_csv_source_name_and_delimiter_do_not_break_the_view(tmp_path):
    (tmp_path / "q.csv").write_text("a'b\n1'2\n")

    source = CSVFileSource(
        name='my "q" source', type="csv", file=str(tmp_path / "q.csv"), delimiter="'"
    )

    assert source.read_sql('SELECT b FROM "my ""q"" source"') == [{"b": 2}]


@pytest.mark.parametrize("type_", SOURCES)
def test_a_relative_file_reads_from_the_project_root_not_the_working_directory(
    tmp_path, monkeypatch, type_
):
    from visivo.models.sources.project_root import set_project_root

    model, write = SOURCES[type_]
    extension = "csv" if type_ == "csv" else "xlsx"
    project = tmp_path / "project"
    (project / "files").mkdir(parents=True)
    write(project / "files" / f"sales.{extension}", 3)
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir()
    monkeypatch.chdir(elsewhere)
    set_project_root(str(project))
    try:
        source = model(name="sales", type=type_, file=f"files/sales.{extension}")

        assert _count(source) == 3
    finally:
        set_project_root(None)
