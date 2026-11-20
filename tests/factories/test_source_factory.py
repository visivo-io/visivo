import sqlite3

from tests.factories.model_factories import (
    SHARED_SQLITE_DATABASE,
    ProjectFactory,
    SourceFactory,
    sqlite_database_for_current_test,
)
from tests.support.utils import temp_folder
from visivo.commands.utils import create_file_database


def test_default_database_is_not_the_file_every_test_used_to_share():
    assert SourceFactory().database != SHARED_SQLITE_DATABASE
    assert ProjectFactory().sources[0].database != SHARED_SQLITE_DATABASE


def test_each_test_gets_its_own_database(monkeypatch):
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "tests/a.py::test_one (call)")
    first = SourceFactory().database
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "tests/a.py::test_two (call)")
    second = SourceFactory().database

    assert first != second


def test_setup_and_call_of_one_test_share_a_database(monkeypatch):
    """A fixture seeds the file in setup; the test body builds its project in call."""
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "tests/a.py::test_one[x (y)] (setup)")
    seeded = SourceFactory().database
    monkeypatch.setenv("PYTEST_CURRENT_TEST", "tests/a.py::test_one[x (y)] (call)")

    assert SourceFactory().database == seeded
    assert ProjectFactory().sources[0].database == seeded


def test_outside_a_test_the_shared_path_is_the_fallback(monkeypatch):
    monkeypatch.delenv("PYTEST_CURRENT_TEST")

    assert sqlite_database_for_current_test() == SHARED_SQLITE_DATABASE


def test_an_explicit_database_wins():
    assert SourceFactory(database="elsewhere.sqlite").database == "elsewhere.sqlite"


def test_seeding_the_default_database_holds_only_this_tests_rows():
    """The shared file collected six more rows from every test that seeded it."""
    source = SourceFactory()
    create_file_database(url=source.url(), output_dir=temp_folder())

    with sqlite3.connect(source.database) as connection:
        (rows,) = connection.execute("select count(*) from test_table").fetchone()

    assert rows == 6
