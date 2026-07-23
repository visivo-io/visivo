"""Tests for the run-on-save machinery: RunManager, the run/logs endpoints,
the status:"draft" signal, and the debounced request_run trigger."""

import time
from unittest.mock import patch

import pytest

from visivo.server.managers.run_manager import RunManager, RunState
from visivo.server.jobs import save_run_executor
from visivo.server.views.run_views import _RESOURCE_ROUTE_RE, RESOURCE_META


@pytest.fixture(autouse=True)
def clean_run_state():
    """Reset the process-wide run registry + debounce globals between tests."""
    mgr = RunManager.instance()
    with mgr._lock:
        mgr._runs.clear()
        mgr._order.clear()
    with save_run_executor._pending_lock:
        if save_run_executor._pending_timer is not None:
            save_run_executor._pending_timer.cancel()
        save_run_executor._pending_timer = None
        save_run_executor._pending_names.clear()
    yield


class TestRunManager:
    def test_list_is_newest_first_with_supersede_and_cloud_shape(self):
        mgr = RunManager.instance()
        first = mgr.create("+a+")
        second = mgr.create("+b+")

        runs = mgr.list()
        assert [r["dag_filter"] for r in runs] == ["+b+", "+a+"]
        # Newest is current; older is superseded.
        assert runs[0]["id"] == second.id and runs[0]["is_superseded"] is False
        assert runs[1]["id"] == first.id and runs[1]["is_superseded"] is True
        # Exact cloud RunSerializer key set, so the viewer needs no local branch.
        assert set(runs[0]) == {
            "id",
            "state",
            "dag_filter",
            "error_json",
            "is_superseded",
            "created_at",
            "updated_at",
        }

    def test_states_use_cloud_vocabulary(self):
        # The viewer keys on these exact strings (e.g. 'succeeded', not 'completed').
        assert RunState.QUEUED.value == "queued"
        assert RunState.RUNNING.value == "running"
        assert RunState.SUCCEEDED.value == "succeeded"
        assert RunState.FAILED.value == "failed"

    def test_set_state_logs_and_error(self):
        mgr = RunManager.instance()
        run = mgr.create("+a+")
        mgr.set_state(run.id, RunState.FAILED, logs="boom", error_json={"phase": "run"})
        got = mgr.get(run.id)
        assert got.state == RunState.FAILED
        assert got.logs == "boom"
        assert got.error_json == {"phase": "run"}


class TestRunEndpoints:
    def test_list_runs_endpoint(self, integration_app, integration_client):
        run = integration_app.run_manager.create("+x+")
        integration_app.run_manager.set_state(run.id, RunState.SUCCEEDED, logs="ok")

        resp = integration_client.get("/api/projects/id/run/")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data[0]["id"] == run.id
        assert data[0]["state"] == "succeeded"
        assert data[0]["dag_filter"] == "+x+"

    def test_run_logs_endpoint(self, integration_app, integration_client):
        run = integration_app.run_manager.create("+x+")
        integration_app.run_manager.set_state(run.id, RunState.SUCCEEDED, logs="hello logs")

        resp = integration_client.get(f"/api/runs/{run.id}/logs/")
        assert resp.status_code == 200
        assert resp.get_json() == {
            "state": "succeeded",
            "logs": "hello logs",
            "error_json": None,
        }

    def test_run_logs_404_for_unknown_run(self, integration_client):
        assert integration_client.get("/api/runs/nope/logs/").status_code == 404

    def test_project_reports_draft_status(self, integration_client):
        # This is the signal the viewer's run-poller gates on.
        assert integration_client.get("/api/project/").get_json()["status"] == "draft"


class TestRunOnSave:
    def test_every_resource_detail_route_matches(self):
        # All mapped resources — incl. the query-mode presentation types
        # (charts/tables/markdowns/dashboards), which run when an inline ?{ }
        # layout query changes — match; list/collection + non-resource routes
        # don't.
        for path in [
            "/api/sources/db/",
            "/api/models/m/",
            "/api/local-merge-models/lm/",
            "/api/insights/i/",
            "/api/charts/c/",
            "/api/tables/t/",
            "/api/markdowns/m/",
            "/api/dashboards/d/",
        ]:
            assert _RESOURCE_ROUTE_RE.match(path), path
        for path in [
            "/api/insights/",  # collection, not a detail route
            "/api/insight-jobs/abc/",  # not a config resource
            "/api/projects/id/run/",
        ]:
            assert _RESOURCE_ROUTE_RE.match(path) is None, path

    def test_resource_meta_modes(self):
        # whole-mode data resources hash their whole config; the insight is
        # query-mode + data-producing; the presentation types are query-mode and
        # NOT data-producing (only an inline ?{ } layout query is data).
        assert RESOURCE_META["models"] == ("model_manager", "whole", True)
        assert RESOURCE_META["insights"] == ("insight_manager", "query", True)
        assert RESOURCE_META["charts"] == ("chart_manager", "query", False)
        assert RESOURCE_META["tables"][1:] == ("query", False)

    def test_request_run_debounces_and_rebuilds_into_main(self, integration_app):
        # Mock the actual build so the test doesn't depend on the factory project
        # being fully buildable — assert the run is created, scoped, and reaches a
        # terminal succeeded state, targeting the "main" run id.
        integration_app._working_dir = "/proj/root"
        with patch.object(save_run_executor, "FilteredRunner") as MockRunner:
            inst = MockRunner.return_value
            inst.failed_job_results = []
            inst.successful_job_results = []

            save_run_executor.request_run(integration_app, ["widget"])

            deadline = time.time() + 5
            while time.time() < deadline:
                runs = integration_app.run_manager.list()
                if runs and runs[0]["state"] in ("succeeded", "failed"):
                    break
                time.sleep(0.05)

        runs = integration_app.run_manager.list()
        assert len(runs) == 1
        assert runs[0]["state"] == "succeeded"
        assert runs[0]["dag_filter"] == "+widget+"
        # Rebuilt into the canonical run id the viewer reads, against the serve
        # working dir (so CsvScriptModel / relative-path commands resolve) — NOT
        # project.path.
        _, kwargs = MockRunner.call_args
        assert kwargs["run_id"] == "main"
        assert kwargs["working_dir"] == "/proj/root"

    def test_request_run_coalesces_rapid_saves(self, integration_app):
        with patch.object(save_run_executor, "FilteredRunner") as MockRunner:
            inst = MockRunner.return_value
            inst.failed_job_results = []
            inst.successful_job_results = []

            # Three quick saves within the debounce window → one coalesced run.
            save_run_executor.request_run(integration_app, ["a"])
            save_run_executor.request_run(integration_app, ["b"])
            save_run_executor.request_run(integration_app, ["a"])

            deadline = time.time() + 5
            while time.time() < deadline:
                runs = integration_app.run_manager.list()
                if runs and runs[0]["state"] in ("succeeded", "failed"):
                    break
                time.sleep(0.05)

        runs = integration_app.run_manager.list()
        assert len(runs) == 1
        assert runs[0]["dag_filter"] == "+a+,+b+"


class TestExplorationRunIsolation:
    """Explorations are workbench drafts, never DAG/YAML config — saving or
    deleting one must never schedule a run (02-architecture.md §2, 07 S3
    contract). What actually protects them is being absent from
    RESOURCE_META/_RESOURCE_ROUTE_RE (run_views.py's hooks gate on
    `request.method in ("POST", "DELETE")` and then consult that table) — so
    the regression test asserts the real invariant, not just "the endpoint
    works": a PUT-based test would pass vacuously since PUT isn't even in the
    hook's method filter.
    """

    def test_explorations_absent_from_resource_meta(self):
        assert "explorations" not in RESOURCE_META

    def test_exploration_routes_do_not_match_resource_route_regex(self):
        for path in [
            "/api/explorations/exp_abc123/",
            "/api/explorations/exp_abc123/consume-return-to/",
        ]:
            assert _RESOURCE_ROUTE_RE.match(path) is None, path

    def test_create_exploration_schedules_no_run(self, integration_client):
        with patch("visivo.server.views.run_views.request_run") as req:
            resp = integration_client.post("/api/explorations/", json={"name": "Scratch"})
            assert resp.status_code == 201
            req.assert_not_called()

    def test_update_exploration_schedules_no_run(self, integration_client):
        created = integration_client.post("/api/explorations/", json={}).get_json()
        with patch("visivo.server.views.run_views.request_run") as req:
            resp = integration_client.post(
                f"/api/explorations/{created['id']}/",
                json={"draft": {"queries": [{"name": "q", "sql": "SELECT 1"}]}},
            )
            assert resp.status_code == 200
            req.assert_not_called()

    def test_delete_exploration_schedules_no_run(self, integration_client):
        created = integration_client.post("/api/explorations/", json={}).get_json()
        with patch("visivo.server.views.run_views.request_run") as req:
            resp = integration_client.delete(f"/api/explorations/{created['id']}/")
            assert resp.status_code == 204
            req.assert_not_called()

    def test_consume_return_to_schedules_no_run(self, integration_client):
        created = integration_client.post(
            "/api/explorations/", json={"return_to": {"dashboard": "kpis"}}
        ).get_json()
        with patch("visivo.server.views.run_views.request_run") as req:
            resp = integration_client.post(f"/api/explorations/{created['id']}/consume-return-to/")
            assert resp.status_code == 200
            req.assert_not_called()


class TestPhase4RunIsolation:
    """Explore 2.0 Phase 4: neither the stateless compile-draft endpoint nor
    the promotion-trail sub-action may ever schedule a run — same regression
    shape as TestExplorationRunIsolation above, extended to the two new
    routes. `/api/insight-compile-draft/` is deliberately its OWN top-level
    segment (not nested under `/api/insights/`) precisely so it can never
    match `_RESOURCE_ROUTE_RE` — that segment IS a monitored resource, so any
    `/api/insights/<anything>/` sub-path would otherwise risk tripping the
    run-on-save hook for a "resource" literally named `compile-draft`.
    """

    def test_compile_draft_route_does_not_match_resource_route_regex(self):
        assert _RESOURCE_ROUTE_RE.match("/api/insight-compile-draft/") is None

    def test_record_promotion_route_does_not_match_resource_route_regex(self):
        assert _RESOURCE_ROUTE_RE.match("/api/explorations/exp_abc123/record-promotion/") is None

    def test_compile_draft_schedules_no_run_even_on_a_failing_request(self, integration_client):
        with patch("visivo.server.views.run_views.request_run") as req:
            resp = integration_client.post("/api/insight-compile-draft/", json={})
            assert resp.status_code == 400
            req.assert_not_called()

    def test_record_promotion_schedules_no_run(self, integration_client):
        created = integration_client.post("/api/explorations/", json={}).get_json()
        with patch("visivo.server.views.run_views.request_run") as req:
            resp = integration_client.post(
                f"/api/explorations/{created['id']}/record-promotion/",
                json={"type": "model", "name": "orders_q"},
            )
            assert resp.status_code == 200
            req.assert_not_called()


class TestDataAffectingGate:
    """A save only triggers a run when it changed the DATA — presentation-only
    edits (an insight type/color, whose query leaves are unchanged) just update
    the views. ``request_run`` is patched so the gate decision is observed
    without launching a real build thread."""

    def _save_insight(self, client, name, props):
        return client.post(f"/api/insights/{name}/", json={"props": props})

    def test_new_insight_with_a_query_runs(self, integration_client):
        with patch("visivo.server.views.run_views.request_run") as req:
            r = self._save_insight(
                integration_client, "w", {"type": "scatter", "x": "?{ ${ref(M).a} }"}
            )
            assert r.status_code == 200
            req.assert_called_once()
            assert req.call_args[0][1] == ["w"]

    def test_presentation_only_edit_skips_run(self, integration_client):
        with patch("visivo.server.views.run_views.request_run") as req:
            self._save_insight(
                integration_client,
                "w",
                {"type": "bar", "x": "?{ ${ref(M).a} }", "marker": {"color": "red"}},
            )
            req.reset_mock()  # ignore the create's run
            r = self._save_insight(
                integration_client,
                "w",
                {"type": "scatter", "x": "?{ ${ref(M).a} }", "marker": {"color": "blue"}},
            )
            assert r.status_code == 200
            req.assert_not_called()

    def test_query_edit_runs(self, integration_client):
        with patch("visivo.server.views.run_views.request_run") as req:
            self._save_insight(
                integration_client, "w", {"type": "scatter", "x": "?{ ${ref(M).a} }"}
            )
            req.reset_mock()
            self._save_insight(
                integration_client, "w", {"type": "scatter", "x": "?{ ${ref(M).b} }"}
            )
            req.assert_called_once()

    def test_model_config_change_runs(self, integration_client):
        with patch("visivo.server.views.run_views.request_run") as req:
            integration_client.post("/api/models/m/", json={"sql": "select 1"})
            req.reset_mock()
            integration_client.post("/api/models/m/", json={"sql": "select 2"})
            req.assert_called_once()
            assert req.call_args[0][1] == ["m"]

    def test_idempotent_save_skips_run(self, integration_client):
        with patch("visivo.server.views.run_views.request_run") as req:
            integration_client.post("/api/models/m/", json={"sql": "select 1"})
            req.reset_mock()
            integration_client.post("/api/models/m/", json={"sql": "select 1"})
            req.assert_not_called()

    def test_deleting_a_data_producing_resource_runs(self, integration_client):
        with patch("visivo.server.views.run_views.request_run") as req:
            self._save_insight(
                integration_client, "w", {"type": "scatter", "x": "?{ ${ref(M).a} }"}
            )
            req.reset_mock()
            r = integration_client.delete("/api/insights/w/")
            assert r.status_code < 400
            req.assert_called_once()

    # Charts are query-mode, non-data-producing: an inline ?{ } layout query is
    # data (visivo folds it into the insight's query), but plain layout edits are
    # not — so a chart only runs when its ?{ } layout query moves.
    def _save_chart(self, client, name, layout):
        return client.post(
            f"/api/charts/{name}/", json={"insights": ["${ref(w)}"], "layout": layout}
        )

    def test_chart_query_layout_change_runs(self, integration_client):
        with patch("visivo.server.views.run_views.request_run") as req:
            self._save_chart(integration_client, "c", {"title": {"text": "?{ ${ref(M).a} }"}})
            req.reset_mock()
            self._save_chart(integration_client, "c", {"title": {"text": "?{ ${ref(M).b} }"}})
            req.assert_called_once()
            assert req.call_args[0][1] == ["c"]

    def test_chart_presentation_only_edit_skips_run(self, integration_client):
        with patch("visivo.server.views.run_views.request_run") as req:
            self._save_chart(integration_client, "c", {"title": {"text": "Hello"}})
            req.reset_mock()
            r = self._save_chart(integration_client, "c", {"title": {"text": "Goodbye"}})
            assert r.status_code == 200
            req.assert_not_called()

    def test_deleting_a_plain_chart_skips_run(self, integration_client):
        with patch("visivo.server.views.run_views.request_run") as req:
            self._save_chart(integration_client, "c", {"title": {"text": "Hello"}})
            req.reset_mock()
            r = integration_client.delete("/api/charts/c/")
            assert r.status_code < 400
            req.assert_not_called()
