"""The Explorer's ad-hoc SQL lane is bounded (VIS-1410): it used to run an
unbounded SELECT * on a thread nobody could stop."""

from visivo.jobs.run_model_data_job import UI_MAX_ROWS, UI_QUERY_TIMEOUT_S, QueryTimeout
from visivo.server.jobs import model_query_job_executor as executor
from visivo.server.managers.preview_run_manager import RunStatus


class _Jobs:
    def __init__(self):
        self.statuses, self.result = [], None

    def update_status(self, job_id, status, **kwargs):
        self.statuses.append((status, kwargs))

    def set_result(self, job_id, result):
        self.result = result


def _run(integration_app, monkeypatch, fake):
    monkeypatch.setattr(executor, "execute_and_get_result", fake)
    jobs = _Jobs()
    source = integration_app.project.sources[0]
    executor.execute_model_query_job(
        "job-1", {"source_name": source.name, "sql": "select 1"}, integration_app, "/tmp", jobs
    )
    return jobs


def test_the_ui_lane_passes_its_cap_and_deadline(integration_app, monkeypatch):
    seen = {}

    def fake(source, sql, **kwargs):
        seen.update(kwargs)
        return {
            "columns": [],
            "rows": [],
            "row_count": 0,
            "truncated": False,
            "execution_time_ms": 1,
        }

    jobs = _run(integration_app, monkeypatch, fake)

    assert seen == {"max_rows": UI_MAX_ROWS, "timeout_s": UI_QUERY_TIMEOUT_S}
    assert jobs.statuses[-1][0] == RunStatus.COMPLETED


def test_a_timeout_fails_the_job_with_the_reason(integration_app, monkeypatch):
    def fake(source, sql, **kwargs):
        raise QueryTimeout("Query did not return within 30s.")

    jobs = _run(integration_app, monkeypatch, fake)

    status, detail = jobs.statuses[-1]
    assert status == RunStatus.FAILED and "did not return within 30s" in detail["error"]


def test_a_truncated_result_reaches_the_client_flagged(integration_app, monkeypatch):
    def fake(source, sql, **kwargs):
        return {
            "columns": ["x"],
            "rows": [{"x": 1}],
            "row_count": 1,
            "truncated": True,
            "execution_time_ms": 1,
        }

    jobs = _run(integration_app, monkeypatch, fake)

    assert jobs.result["truncated"] is True and jobs.result["source_name"]


def test_a_missing_source_name_is_a_validation_failure(integration_app):
    jobs = _Jobs()
    executor.execute_model_query_job("j", {"sql": "select 1"}, integration_app, "/tmp", jobs)

    status, detail = jobs.statuses[-1]
    assert status == RunStatus.FAILED and "source_name is required" in detail["error"]


def test_missing_sql_is_too(integration_app):
    jobs = _Jobs()
    executor.execute_model_query_job("j", {"source_name": "x"}, integration_app, "/tmp", jobs)

    assert "sql is required" in jobs.statuses[-1][1]["error"]


def test_an_unknown_source_names_itself(integration_app):
    jobs = _Jobs()
    executor.execute_model_query_job(
        "j", {"source_name": "nope", "sql": "select 1"}, integration_app, "/tmp", jobs
    )

    assert "Source 'nope' not found" in jobs.statuses[-1][1]["error"]


def test_find_source_by_name_tolerates_no_sources():
    class _P:
        sources = None

    assert executor.find_source_by_name(_P(), "x") is None
