import os
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

import duckdb
import pytest

from visivo.models.sources.database_file import is_remote_database, remote_database_alias
from visivo.models.sources.duckdb_source import DuckdbSource


def _httpfs_available():
    try:
        connection = duckdb.connect(":memory:")
        connection.execute("INSTALL httpfs")
        connection.execute("LOAD httpfs")
        connection.close()
        return True
    except Exception:
        return False


class _RangeHandler(SimpleHTTPRequestHandler):
    """DuckDB reads a remote database with range requests, which the stdlib handler ignores."""

    def log_message(self, *args):
        pass

    def send_head(self):
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            self.send_error(404)
            return None
        size = os.path.getsize(path)
        header = self.headers.get("Range")
        f = open(path, "rb")
        if not header:
            self.send_response(200)
            self.send_header("Content-Length", str(size))
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()
            self._remaining = size
            return f
        start, end = header.replace("bytes=", "").split("-")
        start, end = int(start), int(end) if end else size - 1
        f.seek(start)
        self.send_response(206)
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        outputfile.write(source.read(self._remaining))


@pytest.fixture
def served_database(tmp_path):
    database = tmp_path / "ev-sales.duckdb"
    connection = duckdb.connect(str(database))
    connection.execute("CREATE TABLE ev_sales AS SELECT 1 AS units UNION ALL SELECT 2")
    connection.close()
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(_RangeHandler, directory=str(tmp_path)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_address[1]}/ev-sales.duckdb"
    server.shutdown()


def test_is_remote_database():
    assert is_remote_database("https://example.com/a.duckdb")
    assert is_remote_database("HTTP://example.com/a.duckdb")
    assert not is_remote_database("data/a.duckdb")
    assert not is_remote_database(":memory:")
    assert not is_remote_database(None)


def test_remote_database_alias_is_the_file_stem():
    assert remote_database_alias("https://x.io/samples/ev_sales.duckdb?v=2") == "ev_sales"
    assert remote_database_alias("https://x.io/s/ev-sales.duckdb") == "ev_sales"
    assert remote_database_alias("https://x.io/s/2024.duckdb") == "_2024"
    assert remote_database_alias("https://x.io/") == "remote"


def test_a_remote_database_is_not_a_missing_file():
    DuckdbSource(
        name="d", type="duckdb", database="https://x.io/ev_sales.duckdb"
    ).check_database_files_exist()


@pytest.mark.skipif(not _httpfs_available(), reason="DuckDB httpfs extension is not installed")
def test_a_remote_database_is_attached_read_only_and_queried_by_bare_name(served_database):
    source = DuckdbSource(name="ev", type="duckdb", database=served_database)

    with source.connect(read_only=True) as connection:
        assert connection.execute("SELECT sum(units) FROM ev_sales").fetchone()[0] == 3
        assert connection.execute("SELECT current_database()").fetchone()[0] == "ev_sales"
        with pytest.raises(duckdb.Error):
            connection.execute("CREATE TABLE ev_sales.main.x (a INT)")

    tables = source.get_schema()["tables"]
    assert any(key.endswith("ev_sales") for key in tables)
