"""The background schema job stores under the source's preview run."""

from unittest.mock import Mock

from visivo.query.schema_aggregator import SchemaAggregator
from visivo.server.jobs import source_schema_job_executor as executor
from visivo.server.managers.preview_run_manager import RunStatus


class _Runs:
    def __init__(self):
        self.statuses, self.result = [], None

    def update_status(self, job_id, status, **kwargs):
        self.statuses.append((status, kwargs))

    def set_result(self, job_id, result):
        self.result = result


def _app(source):
    app = Mock()
    app.source_manager.get.return_value = source
    app.project.sources = []
    return app


def test_the_schema_lands_in_the_preview_run(monkeypatch):
    seen = {}

    def fake(**kwargs):
        seen.update(kwargs)
        return Mock(success=True, message="ok")

    monkeypatch.setattr(executor, "run_source_schema_action", fake)
    source = Mock(type="sqlite")
    runs = _Runs()

    executor.execute_source_schema_job("job", {"source_name": "wh"}, _app(source), "/out", runs)

    assert seen["run_id"] == SchemaAggregator.preview_run_id("wh") == "preview-wh"
    assert seen["source_to_build"] is source and seen["output_dir"] == "/out"
    assert runs.statuses[-1][0] == RunStatus.COMPLETED and runs.result["source_name"] == "wh"


def test_a_failed_action_fails_the_job(monkeypatch):
    monkeypatch.setattr(
        executor, "run_source_schema_action", lambda **k: Mock(success=False, message="denied")
    )
    runs = _Runs()

    executor.execute_source_schema_job("job", {"source_name": "wh"}, _app(Mock()), "/out", runs)

    status, detail = runs.statuses[-1]
    assert status == RunStatus.FAILED and "denied" in detail["error"]


def test_an_unknown_source_fails_the_job():
    runs = _Runs()

    executor.execute_source_schema_job("job", {"source_name": "ghost"}, _app(None), "/out", runs)

    status, detail = runs.statuses[-1]
    assert status == RunStatus.FAILED and "ghost" in detail["error"]


def test_a_draft_source_is_built(monkeypatch):
    seen = {}

    def fake(**kwargs):
        seen.update(kwargs)
        return Mock(success=True, message="ok")

    monkeypatch.setattr(executor, "run_source_schema_action", fake)
    draft = Mock(type="duckdb")
    app = Mock()
    app.source_manager.get.side_effect = lambda n: draft if n == "draft_wh" else None
    app.project.sources = []
    runs = _Runs()

    executor.execute_source_schema_job("job", {"source_name": "draft_wh"}, app, "/out", runs)

    assert seen["source_to_build"] is draft
    assert runs.statuses[-1][0] == RunStatus.COMPLETED
