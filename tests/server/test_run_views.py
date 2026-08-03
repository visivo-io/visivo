"""Tests for the run-on-save machinery: RunManager, the run/logs endpoints,
the status:"draft" signal, and the debounced request_run trigger."""

import time
from unittest.mock import patch

import pytest

from visivo.server import user_config
from visivo.server.managers.run_manager import Run, RunManager, RunState
from visivo.server.managers.staged_manager import StagedManager
from visivo.server.jobs import save_run_executor
from visivo.server.views.run_views import _RESOURCE_ROUTE_RE, RESOURCE_META


@pytest.fixture(autouse=True)
def clean_run_state():
    """Reset the process-wide run registry + debounce globals between tests."""
    mgr = RunManager.instance()
    with mgr._lock:
        mgr._runs.clear()
        mgr._order.clear()
    StagedManager.instance().clear()
    with save_run_executor._pending_lock:
        if save_run_executor._pending_timer is not None:
            save_run_executor._pending_timer.cancel()
        save_run_executor._pending_timer = None
        save_run_executor._pending_names.clear()
    yield


@pytest.fixture(autouse=True)
def automatic_trigger(monkeypatch):
    """The existing suite was written when every data save ran immediately, so
    keep that as the baseline. The manual path has its own class below."""
    monkeypatch.setattr(
        "visivo.server.views.run_views.get_run_trigger", lambda: user_config.AUTOMATIC
    )


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
            assert r.status_code == 201
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
            assert r.status_code == 201
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
            assert r.status_code == 201
            req.assert_not_called()

    def test_deleting_a_plain_chart_skips_run(self, integration_client):
        with patch("visivo.server.views.run_views.request_run") as req:
            self._save_chart(integration_client, "c", {"title": {"text": "Hello"}})
            req.reset_mock()
            r = integration_client.delete("/api/charts/c/")
            assert r.status_code < 400
            req.assert_not_called()


class TestTriggerMode:
    """Whether a save fires a run is the user's choice; whether it *stages* is
    not. Both modes record the change — that's what the Run view lists, and what
    the Run button builds."""

    def _save_insight(self, client, name, props):
        return client.post(f"/api/insights/{name}/", json={"props": props})

    def _manual(self, monkeypatch):
        monkeypatch.setattr(
            "visivo.server.views.run_views.get_run_trigger", lambda: user_config.MANUAL
        )

    def test_manual_stages_without_running(self, integration_client, monkeypatch):
        self._manual(monkeypatch)
        with patch("visivo.server.views.run_views.request_run") as req:
            r = self._save_insight(
                integration_client, "w", {"type": "scatter", "x": "?{ ${ref(M).a} }"}
            )
        assert r.status_code == 201
        req.assert_not_called()
        assert StagedManager.instance().list() == [
            {"name": "w", "type": "insight", "status": "modified"}
        ]

    def test_automatic_stages_and_runs(self, integration_client):
        with patch("visivo.server.views.run_views.request_run") as req:
            self._save_insight(
                integration_client, "w", {"type": "scatter", "x": "?{ ${ref(M).a} }"}
            )
        req.assert_called_once()
        assert [i["name"] for i in StagedManager.instance().list()] == ["w"]

    def test_a_presentation_only_edit_stages_nothing_in_either_mode(
        self, integration_client, monkeypatch
    ):
        self._manual(monkeypatch)
        with patch("visivo.server.views.run_views.request_run"):
            self._save_insight(
                integration_client,
                "w",
                {"type": "bar", "x": "?{ ${ref(M).a} }", "marker": {"color": "red"}},
            )
            StagedManager.instance().mark_built(None)  # pretend a run built it
            self._save_insight(
                integration_client,
                "w",
                {"type": "scatter", "x": "?{ ${ref(M).a} }", "marker": {"color": "blue"}},
            )
        assert StagedManager.instance().list() == []

    def test_a_deleted_resource_stages_as_deleted(self, integration_client, monkeypatch):
        self._manual(monkeypatch)
        with patch("visivo.server.views.run_views.request_run"):
            self._save_insight(
                integration_client, "w", {"type": "scatter", "x": "?{ ${ref(M).a} }"}
            )
            integration_client.delete("/api/insights/w/")
        assert StagedManager.instance().list() == [
            {"name": "w", "type": "insight", "status": "deleted"}
        ]


class TestStagedSet:
    """The staged registry is local serve's stand-in for the cloud's data_hash /
    last_built_data_hash columns, and has to behave the same way."""

    def test_a_successful_run_unstages_what_it_built(self):
        staged = StagedManager.instance()
        staged.record("source", "db", "hash-1")
        staged.record("model", "orders", "hash-2")
        staged.mark_built({"db"})
        assert [i["name"] for i in staged.list()] == ["orders"]

    def test_a_full_rebuild_unstages_everything(self):
        staged = StagedManager.instance()
        staged.record("source", "db", "hash-1")
        staged.record("model", "orders", "hash-2")
        staged.mark_built(None)
        assert staged.list() == []

    def test_reverting_an_edit_unstages_it(self):
        """The behavior the cloud gets free from comparing hashes: change a model
        and change it back, and there is nothing left to run. Without it the tab
        dot would stay lit forever."""
        staged = StagedManager.instance()
        staged.record("source", "db", "original")
        staged.mark_built(None)
        staged.record("source", "db", "edited")
        assert [i["name"] for i in staged.list()] == ["db"]
        staged.record("source", "db", "original")
        assert staged.list() == []

    def test_a_failed_run_leaves_the_change_staged(self):
        """mark_built is only called on success, so nothing here un-stages."""
        staged = StagedManager.instance()
        staged.record("source", "db", "hash-1")
        assert [i["name"] for i in staged.list()] == ["db"]

    def test_dag_filter_names_exactly_the_staged_items(self):
        staged = StagedManager.instance()
        staged.record("source", "db", "h1")
        staged.record("model", "orders", "h2")
        assert set(staged.dag_filter().split(",")) == {"+db+", "+orders+"}

    def test_a_deletion_forces_a_full_rebuild(self):
        staged = StagedManager.instance()
        staged.record("source", "db", "h1", status="deleted")
        assert staged.dag_filter() == ""

    def test_nothing_staged_means_run_everything(self):
        assert StagedManager.instance().dag_filter() == ""

    def test_a_built_deletion_drops_out_entirely(self):
        staged = StagedManager.instance()
        staged.record("source", "db", "h1", status="deleted")
        staged.mark_built(None)
        assert staged.list() == []


class TestTriggerRunEndpoint:
    def _unregistered_run(self, dag_filter):
        """A Run the manager doesn't know about — creating one through the
        manager would register it as queued, and the endpoint would then refuse
        its own stubbed run as already in flight."""
        return Run("stub-run", dag_filter)

    def test_builds_the_staged_set_by_default(self, integration_client):
        StagedManager.instance().record("source", "db", "h1")
        with patch("visivo.server.views.run_views.run_now") as run_now:
            run_now.return_value = self._unregistered_run("+db+")
            r = integration_client.post("/api/projects/p/run/", json={})
        assert r.status_code == 201
        assert run_now.call_args[0][1] == "+db+"

    def test_an_explicit_empty_filter_rebuilds_everything(self, integration_client):
        StagedManager.instance().record("source", "db", "h1")
        with patch("visivo.server.views.run_views.run_now") as run_now:
            run_now.return_value = self._unregistered_run("")
            r = integration_client.post("/api/projects/p/run/", json={"dag_filter": ""})
        assert r.status_code == 201
        assert run_now.call_args[0][1] == ""

    def test_refuses_while_a_run_is_in_flight(self, integration_client):
        RunManager.instance().create("+db+")  # created queued
        with patch("visivo.server.views.run_views.run_now") as run_now:
            r = integration_client.post("/api/projects/p/run/", json={})
        assert r.status_code == 409
        assert r.get_json()["action"] == "run_in_progress"
        run_now.assert_not_called()

    def test_returns_the_run_in_the_cloud_shape(self, integration_client):
        with patch("visivo.server.views.run_views.run_now") as run_now:
            run_now.return_value = self._unregistered_run("+db+")
            body = integration_client.post("/api/projects/p/run/", json={}).get_json()
        assert body["state"] == "queued"
        assert body["dag_filter"] == "+db+"
        assert "created_at" in body


class TestPreferencesEndpoint:
    @pytest.fixture(autouse=True)
    def config_in_tmp(self, tmp_path, monkeypatch):
        monkeypatch.setattr(
            user_config, "user_config_path", lambda: tmp_path / ".visivo" / "config.yml"
        )

    def test_get_reports_the_local_default(self, integration_client):
        r = integration_client.get("/api/me/preferences/")
        assert r.status_code == 200
        assert r.get_json() == {"run_trigger": "automatic"}

    def test_put_round_trips(self, integration_client):
        r = integration_client.put("/api/me/preferences/", json={"run_trigger": "manual"})
        assert r.status_code == 200
        assert r.get_json()["run_trigger"] == "manual"
        assert integration_client.get("/api/me/preferences/").get_json() == {
            "run_trigger": "manual"
        }

    def test_an_unknown_value_is_rejected(self, integration_client):
        r = integration_client.put("/api/me/preferences/", json={"run_trigger": "sometimes"})
        assert r.status_code == 400
        assert user_config.get_run_trigger() == "automatic"


class TestChangesCarriesStaged:
    def test_staged_keys_are_additive(self, integration_client):
        StagedManager.instance().record("source", "db", "h1")
        body = integration_client.get("/api/projects/p/changes/").get_json()
        # The keys an older viewer reads are untouched…
        assert "to_publish" in body and "to_remove" in body and "has_changes" in body
        # …and the new ones sit alongside them.
        assert body["staged"] == [{"name": "db", "type": "source", "status": "modified"}]
        assert body["staged_dag_filter"] == "+db+"
        assert body["run_trigger"] in ("automatic", "manual")
