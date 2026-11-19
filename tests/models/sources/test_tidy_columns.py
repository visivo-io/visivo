import duckdb
import pytest

from visivo.models.sources.csv_source import CSVFileSource
from visivo.models.sources.excel_source import ExcelFileSource
from visivo.models.sources.tidy_columns import tidy_column_name, tidy_column_names

HEADERS = ["Date found", "Company/Platform", "Status (checked Nov 3)", "Pay", "Pay!"]
TIDY = ["date_found", "company_platform", "status_checked_nov_3", "pay", "pay_2"]


@pytest.mark.parametrize(
    "header, tidy",
    [
        ("Date found", "date_found"),
        ("Company/Platform", "company_platform"),
        ("Status (checked Nov 3)", "status_checked_nov_3"),
        ("Hours/commitment", "hours_commitment"),
        ("Avg Fare ($)", "avg_fare"),
        ("Café", "cafe"),
        ("2024 sales", "_2024_sales"),
        ("  spaced  ", "spaced"),
        ("$$$", "column"),
        ("already_tidy", "already_tidy"),
    ],
)
def test_a_header_becomes_a_plain_name(header, tidy):
    assert tidy_column_name(header) == tidy


def test_repeated_names_are_numbered():
    assert tidy_column_names(["Pay", "pay", "PAY", "pay 2"]) == ["pay", "pay_2", "pay_3", "pay_2_2"]


def _write_csv(path):
    path.write_text(",".join(f'"{h}"' for h in HEADERS) + "\n2026-10-22,Mercor,open,70,80\n")


def _write_xlsx(path):
    connection = duckdb.connect()
    connection.execute("INSTALL excel")
    connection.execute("LOAD excel")
    columns = ", ".join(f'{i} AS "{h}"' for i, h in enumerate(HEADERS))
    target = str(path).replace("'", "''")
    connection.execute(f"COPY (SELECT {columns}) TO '{target}' (FORMAT xlsx, HEADER true)")
    connection.close()


SOURCES = {"csv": (CSVFileSource, _write_csv, "csv"), "xls": (ExcelFileSource, _write_xlsx, "xlsx")}


def _columns(source):
    with source.connect(read_only=True) as connection:
        rows = connection.execute(f"DESCRIBE {source._quote_table(source.name)}").fetchall()
    return [row[0] for row in rows]


@pytest.mark.parametrize("type_", SOURCES)
def test_normalize_names_renames_the_columns(tmp_path, type_):
    model, write, extension = SOURCES[type_]
    write(tmp_path / f"gigs.{extension}")
    source = model(
        name="gigs", type=type_, file=str(tmp_path / f"gigs.{extension}"), normalize_names=True
    )

    assert _columns(source) == TIDY
    assert len(source.read_sql("SELECT company_platform, status_checked_nov_3 FROM gigs")) == 1


@pytest.mark.parametrize("type_", SOURCES)
def test_without_normalize_names_the_headers_are_kept(tmp_path, type_):
    model, write, extension = SOURCES[type_]
    write(tmp_path / f"gigs.{extension}")
    source = model(name="gigs", type=type_, file=str(tmp_path / f"gigs.{extension}"))

    assert _columns(source)[:3] == HEADERS[:3]
