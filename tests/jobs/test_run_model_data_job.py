"""execute_and_get_result is the one path ad-hoc SQL takes to a client, so
it is where a cap and a deadline belong (VIS-1410)."""

import time

import pyarrow.parquet as pq
import pytest

import threading

from visivo.jobs import run_model_data_job as module
from visivo.jobs.run_model_data_job import (
    AGENT_QUERY_TIMEOUT_S,
    BOUNDED_QUERY_THREAD_NAME,
    MAX_BOUNDED_QUERIES,
    UI_MAX_ROWS,
    UI_QUERY_TIMEOUT_S,
    QueryTimeout,
    execute_and_get_result,
)
from visivo.output_paths import model_data_file, run_dir


class _Source:
    """Only ``read_sql`` is touched; a Pydantic source would need a database."""

    def __init__(self, rows=None, delay=0):
        self.rows = rows if rows is not None else [{"x": i} for i in range(10)]
        self.delay = delay

    def read_sql(self, sql):
        time.sleep(self.delay)
        return list(self.rows)


class TestTheCap:
    def test_rows_beyond_max_rows_are_dropped_and_flagged(self):
        result = execute_and_get_result(_Source(), "select 1", max_rows=3)

        assert result["rows"] == [{"x": 0}, {"x": 1}, {"x": 2}]
        assert result["row_count"] == 3 and result["truncated"] is True

    def test_exactly_max_rows_is_not_truncated(self):
        result = execute_and_get_result(_Source(), "select 1", max_rows=10)

        assert result["row_count"] == 10 and result["truncated"] is False

    def test_no_cap_returns_everything(self):
        result = execute_and_get_result(_Source(), "select 1")

        assert result["row_count"] == 10 and result["truncated"] is False
        assert result["columns"] == ["x"]

    def test_an_empty_result_has_no_columns(self):
        result = execute_and_get_result(_Source(rows=[]), "select 1", max_rows=5)

        assert result == {
            "columns": [],
            "rows": [],
            "row_count": 0,
            "truncated": False,
            "execution_time_ms": result["execution_time_ms"],
        }

    def test_the_parquet_is_whole_even_when_the_rows_are_capped(self, tmp_path):
        execute_and_get_result(_Source(), "select 1", str(tmp_path), "m", max_rows=2)

        written = pq.read_table(model_data_file(run_dir(str(tmp_path)), "m"))
        assert written.num_rows == 10


class TestTheDeadline:
    def test_a_slow_query_raises_a_readable_timeout(self):
        with pytest.raises(QueryTimeout, match="did not return within 0.05s"):
            execute_and_get_result(_Source(delay=1), "select 1", timeout_s=0.05)

    def test_it_is_a_timeout_error_for_callers_that_catch_the_builtin(self):
        assert issubclass(QueryTimeout, TimeoutError)

    def test_a_fast_query_under_a_deadline_is_unchanged(self):
        result = execute_and_get_result(_Source(), "select 1", timeout_s=5)

        assert result["row_count"] == 10

    def test_an_abandoned_query_runs_on_a_daemon_thread(self):
        with pytest.raises(QueryTimeout):
            execute_and_get_result(_Source(delay=0.5), "select 1", timeout_s=0.01)

        orphans = [t for t in threading.enumerate() if t.name == BOUNDED_QUERY_THREAD_NAME]
        assert orphans and all(t.daemon for t in orphans)

    def test_a_driver_error_comes_back_unchanged(self):
        class _Broken:
            def read_sql(self, sql):
                raise ValueError("no such column")

        with pytest.raises(ValueError, match="no such column"):
            execute_and_get_result(_Broken(), "select 1", timeout_s=5)

    def test_orphans_are_capped(self, monkeypatch):
        monkeypatch.setattr(module, "_query_slots", threading.BoundedSemaphore(1))
        with pytest.raises(QueryTimeout):
            execute_and_get_result(_Source(delay=0.5), "select 1", timeout_s=0.01)
        before = threading.active_count()

        with pytest.raises(QueryTimeout, match="did not return within 0.01s"):
            execute_and_get_result(_Source(), "select 1", timeout_s=0.01)

        assert threading.active_count() == before

    def test_a_finished_query_frees_its_slot(self, monkeypatch):
        monkeypatch.setattr(module, "_query_slots", threading.BoundedSemaphore(MAX_BOUNDED_QUERIES))
        for _ in range(MAX_BOUNDED_QUERIES + 1):
            execute_and_get_result(_Source(), "select 1", timeout_s=5)

        assert module._query_slots._value == MAX_BOUNDED_QUERIES

    def test_the_budgets_jared_set(self):
        assert UI_QUERY_TIMEOUT_S == 30 and AGENT_QUERY_TIMEOUT_S == 20
        assert UI_MAX_ROWS == 50_000


def test_write_parquet_from_data_with_no_rows_keeps_the_given_columns(tmp_path):
    import duckdb
    from visivo.jobs.run_model_data_job import write_parquet_from_data

    path = write_parquet_from_data([], str(tmp_path), "empty", columns=["a", "b"])

    assert duckdb.sql(f"SELECT * FROM read_parquet('{path}')").columns == ["a", "b"]
