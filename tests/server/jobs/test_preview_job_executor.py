import json
import os
import pytest
from unittest.mock import MagicMock, patch
from copy import deepcopy

from visivo.server.jobs.preview_job_executor import (
    _inject_cached_objects,
    _inject_context_objects,
    _assert_insights_present,
    execute_preview_job,
    MANAGER_TO_PROJECT_FIELD,
    CONTEXT_OBJECT_TYPES,
)
from visivo.server.managers.preview_run_manager import RunStatus
from tests.factories.model_factories import (
    ProjectFactory,
    SqlModelFactory,
    SourceFactory,
    InsightFactory,
    MetricFactory,
    DimensionFactory,
)


def _make_project(**kwargs):
    defaults = {"dashboards": []}
    defaults.update(kwargs)
    return ProjectFactory(**defaults)


def _make_flask_app_mock(project, cached_overrides=None):
    flask_app = MagicMock()
    flask_app.project = project

    for manager_attr, _ in MANAGER_TO_PROJECT_FIELD:
        manager = MagicMock()
        manager.cached_objects = {}
        setattr(flask_app, manager_attr, manager)

    if cached_overrides:
        for manager_attr, cached in cached_overrides.items():
            getattr(flask_app, manager_attr).cached_objects = cached

    return flask_app


class TestInjectCachedObjects:
    def test_no_cached_objects_leaves_project_unchanged(self):
        source = SourceFactory(name="src")
        model = SqlModelFactory(name="my_model", source="ref(src)")
        project = _make_project(sources=[source], models=[model])
        preview_project = deepcopy(project)
        flask_app = _make_flask_app_mock(project)

        _inject_cached_objects(flask_app, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].name == "my_model"

    def test_cached_model_added_to_project(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[])
        preview_project = deepcopy(project)

        cached_model = SqlModelFactory(name="cached_model", source="ref(src)")
        flask_app = _make_flask_app_mock(
            project, cached_overrides={"model_manager": {"cached_model": cached_model}}
        )

        _inject_cached_objects(flask_app, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].name == "cached_model"

    def test_cached_model_overrides_published_with_same_name(self):
        source = SourceFactory(name="src")
        published_model = SqlModelFactory(name="my_model", sql="SELECT 1", source="ref(src)")
        project = _make_project(sources=[source], models=[published_model])
        preview_project = deepcopy(project)

        cached_model = SqlModelFactory(name="my_model", sql="SELECT 2", source="ref(src)")
        flask_app = _make_flask_app_mock(
            project, cached_overrides={"model_manager": {"my_model": cached_model}}
        )

        _inject_cached_objects(flask_app, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].sql == "SELECT 2"

    def test_none_cached_objects_are_skipped(self):
        source = SourceFactory(name="src")
        published_model = SqlModelFactory(name="my_model", sql="SELECT 1", source="ref(src)")
        project = _make_project(sources=[source], models=[published_model])
        preview_project = deepcopy(project)

        flask_app = _make_flask_app_mock(
            project, cached_overrides={"model_manager": {"my_model": None}}
        )

        _inject_cached_objects(flask_app, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].sql == "SELECT 1"

    def test_multiple_managers_inject(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[], insights=[])
        preview_project = deepcopy(project)

        cached_model = SqlModelFactory(name="new_model", source="ref(src)")
        cached_insight = InsightFactory(name="new_insight")
        flask_app = _make_flask_app_mock(
            project,
            cached_overrides={
                "model_manager": {"new_model": cached_model},
                "insight_manager": {"new_insight": cached_insight},
            },
        )

        _inject_cached_objects(flask_app, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].name == "new_model"
        insight_names = [i.name for i in preview_project.insights]
        assert "new_insight" in insight_names

    def test_cached_source_added_to_project(self):
        project = _make_project(sources=[], models=[])
        preview_project = deepcopy(project)

        cached_source = SourceFactory(name="cached_src")
        flask_app = _make_flask_app_mock(
            project, cached_overrides={"source_manager": {"cached_src": cached_source}}
        )

        _inject_cached_objects(flask_app, preview_project)

        source_names = [s.name for s in preview_project.sources]
        assert "cached_src" in source_names

    def test_missing_manager_is_gracefully_skipped(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[])
        preview_project = deepcopy(project)

        flask_app = _make_flask_app_mock(project)
        flask_app.model_manager = None

        _inject_cached_objects(flask_app, preview_project)

        assert len(preview_project.models) == 0

    def test_cached_objects_are_deepcopied(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[])
        preview_project = deepcopy(project)

        cached_model = SqlModelFactory(name="m", source="ref(src)")
        flask_app = _make_flask_app_mock(
            project, cached_overrides={"model_manager": {"m": cached_model}}
        )

        _inject_cached_objects(flask_app, preview_project)

        assert preview_project.models[0] is not cached_model
        assert preview_project.models[0].name == cached_model.name

    def test_cached_and_published_coexist(self):
        source = SourceFactory(name="src")
        published_model = SqlModelFactory(name="pub_model", source="ref(src)")
        project = _make_project(sources=[source], models=[published_model])
        preview_project = deepcopy(project)

        cached_model = SqlModelFactory(name="cached_model", source="ref(src)")
        flask_app = _make_flask_app_mock(
            project, cached_overrides={"model_manager": {"cached_model": cached_model}}
        )

        _inject_cached_objects(flask_app, preview_project)

        assert len(preview_project.models) == 2
        model_names = [m.name for m in preview_project.models]
        assert "pub_model" in model_names
        assert "cached_model" in model_names


class TestInjectContextObjects:
    def test_none_context_objects_is_noop(self):
        source = SourceFactory(name="src")
        model = SqlModelFactory(name="my_model", source="ref(src)")
        project = _make_project(sources=[source], models=[model])
        preview_project = deepcopy(project)

        _inject_context_objects(None, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].name == "my_model"

    def test_empty_context_objects_is_noop(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[])
        preview_project = deepcopy(project)

        _inject_context_objects({}, preview_project)

        assert len(preview_project.models) == 0

    def test_context_model_added_to_project(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[])
        preview_project = deepcopy(project)

        context_objects = {
            "models": [{"name": "ctx_model", "sql": "SELECT 1", "source": "${ref(src)}"}],
        }
        _inject_context_objects(context_objects, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].name == "ctx_model"
        assert preview_project.models[0].sql == "SELECT 1"

    def test_context_model_overrides_existing(self):
        source = SourceFactory(name="src")
        existing_model = SqlModelFactory(name="my_model", sql="SELECT old", source="ref(src)")
        project = _make_project(sources=[source], models=[existing_model])
        preview_project = deepcopy(project)

        context_objects = {
            "models": [{"name": "my_model", "sql": "SELECT new", "source": "${ref(src)}"}],
        }
        _inject_context_objects(context_objects, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].sql == "SELECT new"

    def test_context_dimensions_added(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[], dimensions=[])
        preview_project = deepcopy(project)

        context_objects = {
            "dimensions": [{"name": "order_month", "expression": "DATE_TRUNC('month', date)"}],
        }
        _inject_context_objects(context_objects, preview_project)

        assert len(preview_project.dimensions) == 1
        assert preview_project.dimensions[0].name == "order_month"

    def test_context_metrics_added(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[], metrics=[])
        preview_project = deepcopy(project)

        context_objects = {
            "metrics": [{"name": "total_rev", "expression": "SUM(amount)"}],
        }
        _inject_context_objects(context_objects, preview_project)

        assert len(preview_project.metrics) == 1
        assert preview_project.metrics[0].name == "total_rev"

    def test_context_overrides_cached_objects(self):
        source = SourceFactory(name="src")
        cached_model = SqlModelFactory(name="my_model", sql="SELECT cached", source="ref(src)")
        project = _make_project(sources=[source], models=[])
        preview_project = deepcopy(project)

        flask_app = _make_flask_app_mock(
            project, cached_overrides={"model_manager": {"my_model": cached_model}}
        )
        _inject_cached_objects(flask_app, preview_project)

        assert preview_project.models[0].sql == "SELECT cached"

        context_objects = {
            "models": [{"name": "my_model", "sql": "SELECT context", "source": "${ref(src)}"}],
        }
        _inject_context_objects(context_objects, preview_project)

        assert len(preview_project.models) == 1
        assert preview_project.models[0].sql == "SELECT context"

    def test_unknown_type_is_ignored(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[])
        preview_project = deepcopy(project)

        context_objects = {
            "unknown_type": [{"name": "foo"}],
        }
        _inject_context_objects(context_objects, preview_project)

        assert len(preview_project.models) == 0

    def test_multiple_types_injected(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[], dimensions=[], metrics=[])
        preview_project = deepcopy(project)

        context_objects = {
            "models": [{"name": "m1", "sql": "SELECT 1", "source": "${ref(src)}"}],
            "dimensions": [{"name": "d1", "expression": "col_a"}],
            "metrics": [{"name": "met1", "expression": "SUM(col_b)"}],
        }
        _inject_context_objects(context_objects, preview_project)

        assert len(preview_project.models) == 1
        assert len(preview_project.dimensions) == 1
        assert len(preview_project.metrics) == 1


class TestManagerConfig:
    def test_csv_script_model_manager_in_map(self):
        field_map = dict(MANAGER_TO_PROJECT_FIELD)
        assert "csv_script_model_manager" in field_map
        assert field_map["csv_script_model_manager"] == "csv_script_models"

    def test_local_merge_model_manager_in_map(self):
        field_map = dict(MANAGER_TO_PROJECT_FIELD)
        assert "local_merge_model_manager" in field_map
        assert field_map["local_merge_model_manager"] == "local_merge_models"

    def test_context_object_types_is_set(self):
        assert isinstance(CONTEXT_OBJECT_TYPES, (set, frozenset))

    def test_context_object_types_includes_insights(self):
        assert "insights" in CONTEXT_OBJECT_TYPES


class TestInjectContextInsights:
    def test_context_insight_added_to_project(self):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[], insights=[])
        preview_project = deepcopy(project)

        context_objects = {
            "insights": [
                {
                    "name": "ctx_insight",
                    "props": {"type": "scatter", "x": "?{x}", "y": "?{y}"},
                }
            ],
        }
        _inject_context_objects(context_objects, preview_project)

        assert len(preview_project.insights) == 1
        assert preview_project.insights[0].name == "ctx_insight"

    def test_context_insight_overrides_published(self):
        source = SourceFactory(name="src")
        published = InsightFactory(name="shared_name")
        project = _make_project(sources=[source], models=[], insights=[published])
        preview_project = deepcopy(project)

        context_objects = {
            "insights": [
                {
                    "name": "shared_name",
                    "props": {"type": "bar", "x": "?{x}", "y": "?{y}"},
                }
            ],
        }
        _inject_context_objects(context_objects, preview_project)

        assert len(preview_project.insights) == 1
        assert preview_project.insights[0].name == "shared_name"
        assert preview_project.insights[0].props.type == "bar"


class TestAssertInsightsPresent:
    def test_all_present_does_not_raise(self):
        project = _make_project(insights=[InsightFactory(name="a"), InsightFactory(name="b")])
        _assert_insights_present(project, ["a", "b"])

    def test_missing_insight_raises(self):
        project = _make_project(insights=[InsightFactory(name="a")])
        with pytest.raises(ValueError, match="not present"):
            _assert_insights_present(project, ["a", "missing"])

    def test_empty_project_insights_raises(self):
        project = _make_project(insights=[])
        with pytest.raises(ValueError, match="not present"):
            _assert_insights_present(project, ["anything"])


class _FakeRunner:
    """FilteredRunner stub that writes fake result files for each DAG-filter insight."""

    instances = []
    # Per-class config: insights to deliberately fail (don't write JSON
    # for them) and the captured failure message to report through
    # `failed_job_results`. Cleared between tests.
    fail_insights = {}

    def __init__(self, project, output_dir, **kwargs):
        self.project = project
        self.output_dir = output_dir
        self.dag_filter = kwargs.get("dag_filter")
        self.run_id = kwargs.get("run_id")
        self.failed_job_results = []
        self.successful_job_results = []
        _FakeRunner.instances.append(self)

    def run(self):
        # Emulate what FilteredRunner writes: one json file per insight in insights/<hash>.json
        from visivo.models.base.named_model import alpha_hash

        insights_dir = os.path.join(self.output_dir, self.run_id, "insights")
        os.makedirs(insights_dir, exist_ok=True)
        # Parse the dag_filter to figure out which names are requested.
        # Filter shape: "+a+,+b+" or single "+a+"
        for segment in self.dag_filter.split(","):
            segment = segment.strip().strip("+")
            if not segment:
                continue
            if segment in _FakeRunner.fail_insights:
                # Simulate a soft-failed job: skip writing the JSON and
                # capture an error result the way DagRunner would have.
                fake_item = MagicMock()
                fake_item.name = segment
                fake_result = MagicMock()
                fake_result.item = fake_item
                fake_result.success = False
                fake_result.message = _FakeRunner.fail_insights[segment]
                self.failed_job_results.append(fake_result)
                continue
            name_hash = alpha_hash(segment)
            path = os.path.join(insights_dir, f"{name_hash}.json")
            with open(path, "w") as f:
                json.dump({"name": segment, "files": []}, f)


def _fresh_run_manager_mock():
    mgr = MagicMock()
    mgr._results = {}

    def _set_result(job_id, result):
        mgr._results[job_id] = result

    mgr.set_result.side_effect = _set_result
    return mgr


class TestExecutePreviewJob:
    def setup_method(self, _):
        _FakeRunner.instances = []
        _FakeRunner.fail_insights = {}

    def _patched_execute(self, **kwargs):
        return patch("visivo.server.jobs.preview_job_executor.FilteredRunner", _FakeRunner)

    def test_single_insight_name_in_list(self, tmp_path):
        source = SourceFactory(name="src")
        insight_a = InsightFactory(name="a")
        project = _make_project(sources=[source], models=[], insights=[insight_a])
        flask_app = _make_flask_app_mock(project)
        run_manager = _fresh_run_manager_mock()

        with self._patched_execute():
            execute_preview_job(
                "job-1", ["a"], flask_app, str(tmp_path), run_manager, context_objects=None
            )

        assert "job-1" in run_manager._results
        result = run_manager._results["job-1"]
        assert "insights" in result
        assert set(result["insights"].keys()) == {"a"}

    def test_multi_insight_batched(self, tmp_path):
        source = SourceFactory(name="src")
        insights = [InsightFactory(name="a"), InsightFactory(name="b"), InsightFactory(name="c")]
        project = _make_project(sources=[source], models=[], insights=insights)
        flask_app = _make_flask_app_mock(project)
        run_manager = _fresh_run_manager_mock()

        with self._patched_execute():
            execute_preview_job(
                "job-multi",
                ["a", "b", "c"],
                flask_app,
                str(tmp_path),
                run_manager,
                context_objects=None,
            )

        result = run_manager._results["job-multi"]
        assert set(result["insights"].keys()) == {"a", "b", "c"}
        # Multi-node DAG filter string contains every name
        assert len(_FakeRunner.instances) == 1
        filter_str = _FakeRunner.instances[0].dag_filter
        for name in ["a", "b", "c"]:
            assert f"+{name}+" in filter_str

    def test_single_runner_invocation_regardless_of_insight_count(self, tmp_path):
        """Regression guard for combine_dags: one runner call handles all N insights."""
        source = SourceFactory(name="src")
        insights = [InsightFactory(name=f"ins_{i}") for i in range(5)]
        project = _make_project(sources=[source], models=[], insights=insights)
        flask_app = _make_flask_app_mock(project)
        run_manager = _fresh_run_manager_mock()

        with self._patched_execute():
            execute_preview_job(
                "job-5",
                [f"ins_{i}" for i in range(5)],
                flask_app,
                str(tmp_path),
                run_manager,
                context_objects=None,
            )

        # Exactly one FilteredRunner instantiation handles all 5 insights
        assert len(_FakeRunner.instances) == 1

    def test_context_insight_merged_before_run(self, tmp_path):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[], insights=[])
        flask_app = _make_flask_app_mock(project)
        run_manager = _fresh_run_manager_mock()

        context_objects = {
            "insights": [
                {"name": "ctx_only", "props": {"type": "scatter", "x": "?{x}", "y": "?{y}"}}
            ]
        }

        with self._patched_execute():
            execute_preview_job(
                "job-ctx",
                ["ctx_only"],
                flask_app,
                str(tmp_path),
                run_manager,
                context_objects=context_objects,
            )

        result = run_manager._results["job-ctx"]
        assert "ctx_only" in result["insights"]
        # The merged project passed to the runner contained the overlay insight
        assert any(i.name == "ctx_only" for i in _FakeRunner.instances[0].project.insights)

    def test_missing_insight_sets_failed_status(self, tmp_path):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[], insights=[InsightFactory(name="a")])
        flask_app = _make_flask_app_mock(project)
        run_manager = _fresh_run_manager_mock()

        with self._patched_execute():
            execute_preview_job(
                "job-missing",
                ["a", "missing"],
                flask_app,
                str(tmp_path),
                run_manager,
                context_objects=None,
            )

        # Status should be FAILED, set_result should NOT have been called
        assert "job-missing" not in run_manager._results
        # update_status was called with FAILED at some point
        statuses = [call[0][1] for call in run_manager.update_status.call_args_list]
        assert RunStatus.FAILED in statuses

    def test_empty_insight_names_sets_failed_status(self, tmp_path):
        source = SourceFactory(name="src")
        project = _make_project(sources=[source], models=[])
        flask_app = _make_flask_app_mock(project)
        run_manager = _fresh_run_manager_mock()

        with self._patched_execute():
            execute_preview_job(
                "job-empty", [], flask_app, str(tmp_path), run_manager, context_objects=None
            )

        assert "job-empty" not in run_manager._results
        statuses = [call[0][1] for call in run_manager.update_status.call_args_list]
        assert RunStatus.FAILED in statuses

    def test_run_id_uses_job_id_not_insight_name(self, tmp_path):
        """run_id must be derived from job_id so a multi-insight job has one filesystem path."""
        source = SourceFactory(name="src")
        project = _make_project(
            sources=[source], models=[], insights=[InsightFactory(name="some-special-name")]
        )
        flask_app = _make_flask_app_mock(project)
        run_manager = _fresh_run_manager_mock()

        with self._patched_execute():
            execute_preview_job(
                "job-abc123",
                ["some-special-name"],
                flask_app,
                str(tmp_path),
                run_manager,
                context_objects=None,
            )

        assert _FakeRunner.instances[0].run_id == "preview-job-abc123"

    def test_multi_insight_shared_model_resolves(self, tmp_path):
        """Two insights share one model; the merged project resolves the ref for both."""
        source = SourceFactory(name="src")
        shared_model = SqlModelFactory(name="shared", source="ref(src)")
        ins_a = InsightFactory(name="a")
        ins_b = InsightFactory(name="b")
        project = _make_project(sources=[source], models=[shared_model], insights=[ins_a, ins_b])
        flask_app = _make_flask_app_mock(project)
        run_manager = _fresh_run_manager_mock()

        with self._patched_execute():
            execute_preview_job(
                "job-shared",
                ["a", "b"],
                flask_app,
                str(tmp_path),
                run_manager,
                context_objects=None,
            )

        result = run_manager._results["job-shared"]
        assert set(result["insights"].keys()) == {"a", "b"}
        # Model is present in the runner's project exactly once
        assert sum(1 for m in _FakeRunner.instances[0].project.models if m.name == "shared") == 1

    # ----------------------------------------------------------------
    # Surface real upstream errors when the insight JSON is missing
    # because of a soft-failure during the runner pass.
    # ----------------------------------------------------------------

    def test_missing_json_surfaces_runner_error_message(self, tmp_path):
        """When the insight job soft-fails, its JSON is never written.
        The executor should now read the runner's per-job error and
        propagate that message to the run manager — not the generic
        "Insight file not found" string."""
        ins_a = InsightFactory(name="failing_insight")
        project = _make_project(insights=[ins_a])
        flask_app = _make_flask_app_mock(project)
        run_manager = _fresh_run_manager_mock()

        _FakeRunner.fail_insights = {
            "failing_insight": "SQL parse error: literal '[0]' in column expression"
        }

        with self._patched_execute():
            execute_preview_job(
                "job-fail",
                ["failing_insight"],
                flask_app,
                str(tmp_path),
                run_manager,
                context_objects=None,
            )

        # The executor's outer try/except sets RunStatus.FAILED with
        # the upstream error baked into the message.
        update_calls = run_manager.update_status.call_args_list
        # Pull the last update; it should carry the FAILED status with
        # the upstream error in the `error` kwarg.
        last_kwargs = update_calls[-1].kwargs
        assert "Preview execution failed" in last_kwargs.get("error", "")
        assert "failing_insight" in last_kwargs["error"]
        assert "SQL parse error" in last_kwargs["error"]

    def test_missing_json_falls_back_when_no_runner_error(self, tmp_path):
        """If the JSON is missing AND the runner has no failed_job_results
        (an unexpected case), the generic message is still raised so
        the user sees *something*."""
        ins = InsightFactory(name="ghost_insight")
        project = _make_project(insights=[ins])
        flask_app = _make_flask_app_mock(project)
        run_manager = _fresh_run_manager_mock()

        # The fake runner skips JSON for the requested insight without
        # capturing a failed job — simulating a runner bug.
        class _SilentRunner(_FakeRunner):
            def run(self):
                # Do nothing — no JSON, no captured error.
                pass

        with patch("visivo.server.jobs.preview_job_executor.FilteredRunner", _SilentRunner):
            execute_preview_job(
                "job-ghost",
                ["ghost_insight"],
                flask_app,
                str(tmp_path),
                run_manager,
                context_objects=None,
            )

        last_kwargs = run_manager.update_status.call_args_list[-1].kwargs
        assert "Insight file not found" in last_kwargs.get("error", "")
