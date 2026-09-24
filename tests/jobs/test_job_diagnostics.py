"""W3 (Error Legibility): every failed JobResult carries a Diagnostic, and jobs
skipped for a failed dependency are recorded instead of silently dropped.

The three load-bearing failure sites (source failure, SQL error,
skipped-dependency) are covered against real projects — the same construction
pattern as tests/jobs/test_run_insight_job_join_errors.py — plus the B9 guard:
a model-less insight must fail its own job with a legible diagnostic rather
than IndexError-ing the runner's scheduling loop (which killed the whole run,
and the process under `visivo run`).
"""

import io
import sys

import pytest

from tests.factories.model_factories import (
    InsightFactory,
    ProjectFactory,
    SingleSelectInputFactory,
    SourceFactory,
    SqlModelFactory,
)
from tests.support.utils import temp_folder
from visivo.commands.utils import create_file_database
from visivo.jobs.filtered_runner import FilteredRunner
from visivo.jobs.run_input_job import action as input_action
from visivo.jobs.run_insight_job import action as insight_action
from visivo.jobs.run_insight_job import job as insight_job
from visivo.jobs.run_source_schema_job import action as source_schema_action
from visivo.jobs.run_sql_model_job import (
    model_query_and_schema_action,
    schema_only_action,
)
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.models.project import Project


def _model_less_insight_project():
    insight = Insight(name="lonely", props=InsightProps(type="scatter", x="?{ 1 }"))
    project = Project(name="p", insights=[insight], dashboards=[])
    return project, insight


class TestMissingModelGuard:
    """B9: an insight that references no model."""

    def test_job_creation_does_not_raise(self):
        # On main this IndexErrors inside the DAG runner's scheduling loop.
        project, insight = _model_less_insight_project()
        created = insight_job(project.dag(), temp_folder(), insight)
        assert created is not None

    def test_the_created_job_reports_a_missing_model_diagnostic(self):
        project, insight = _model_less_insight_project()
        created = insight_job(project.dag(), temp_folder(), insight)

        result = created.action(**created.kwargs)

        assert result.success is False
        assert result.diagnostic is not None
        assert result.diagnostic.code == "missing_model"
        assert result.diagnostic.object.type == "insight"
        assert result.diagnostic.object.name == "lonely"
        assert "does not reference a model" in result.diagnostic.message
        assert result.diagnostic.hint

    def test_direct_action_call_is_guarded_too(self):
        project, insight = _model_less_insight_project()
        result = insight_action(insight, project.dag(), temp_folder())
        assert result.success is False
        assert result.diagnostic.code == "missing_model"

    def test_a_full_run_survives_a_model_less_insight(self):
        """The whole point of the guard: the runner finishes and records the
        failure instead of crashing serve/run."""
        project, insight = _model_less_insight_project()
        runner = FilteredRunner(project=project, output_dir=temp_folder(), soft_failure=True)
        runner.run()

        assert [d.code for d in runner.diagnostics] == ["missing_model"]
        assert runner.diagnostics[0].object.name == "lonely"


def _failing_source_project():
    """A project whose source-schema job fails: sqlite cannot open a database
    file inside a directory that does not exist."""
    source = SourceFactory(name="bad_source", database="/nonexistent_dir_w3/nope.sqlite")
    model = SqlModelFactory(name="model1", source="ref(bad_source)")
    insight = InsightFactory(name="insight1", model=model)
    return ProjectFactory(sources=[source], models=[model], insights=[insight], dashboards=[])


class TestSourceFailureDiagnostic:
    def test_unreachable_source_fails_with_a_source_diagnostic(self):
        project = _failing_source_project()
        source = project.sources[0]

        result = source_schema_action(source_to_build=source, output_dir=temp_folder())

        assert result.success is False
        assert result.diagnostic is not None
        assert result.diagnostic.code in ("schema_build_failed", "source_connection_failed")
        assert result.diagnostic.object.type == "source"
        assert result.diagnostic.object.name == "bad_source"
        assert result.diagnostic.message

    def test_a_source_locked_tag_is_lifted_to_the_typed_code(self, monkeypatch):
        """PR #629 tags lock conflicts `[source_locked]` precisely so W3 can
        lift them into the Diagnostic without rewording."""
        source = SourceFactory(name="held", database=":memory:")
        monkeypatch.setattr(
            type(source),
            "get_schema",
            lambda self, table_names=None: (_ for _ in ()).throw(
                Exception("Cannot open 'x.duckdb' [source_locked]: held by another process")
            ),
        )

        result = source_schema_action(source_to_build=source, output_dir=temp_folder())

        assert result.success is False
        assert result.diagnostic.code == "source_locked"

    def test_a_plain_connection_failure_keeps_the_connection_code(self, monkeypatch):
        source = SourceFactory(name="refused", database=":memory:")
        monkeypatch.setattr(
            type(source),
            "get_schema",
            lambda self, table_names=None: (_ for _ in ()).throw(Exception("connection refused")),
        )

        result = source_schema_action(source_to_build=source, output_dir=temp_folder())

        assert result.success is False
        assert result.diagnostic.code == "source_connection_failed"
        assert result.diagnostic.message == "connection refused"


class TestSqlErrorDiagnostic:
    def _working_source_project(self, sql):
        output_dir = temp_folder()
        source = SourceFactory(name="src", database=f"{output_dir}/test.sqlite")
        model = SqlModelFactory(name="orders", source="ref(src)", sql=sql)
        project = ProjectFactory(sources=[source], models=[model], dashboards=[])
        create_file_database(url=source.url(), output_dir=output_dir)
        return output_dir, project, model

    def test_query_failure_carries_a_query_execution_diagnostic(self):
        output_dir, project, model = self._working_source_project(
            "SELECT * FROM table_that_does_not_exist"
        )

        result = model_query_and_schema_action(model, project.dag(), output_dir)

        assert result.success is False
        assert result.diagnostic is not None
        assert result.diagnostic.code == "query_execution_failed"
        assert result.diagnostic.object.type == "model"
        assert result.diagnostic.object.name == "orders"
        assert result.diagnostic.message

    def test_schema_only_failure_carries_a_schema_build_diagnostic(self, mocker):
        output_dir, project, model = self._working_source_project("SELECT 1 AS id")
        mocker.patch(
            "visivo.jobs.run_sql_model_job._build_and_write_schema",
            side_effect=RuntimeError("schema build blew up"),
        )

        result = schema_only_action(model, project.dag(), output_dir)

        assert result.success is False
        assert result.diagnostic.code == "schema_build_failed"
        assert result.diagnostic.object.name == "orders"
        assert result.diagnostic.message == "schema build blew up"


class TestInputFailureDiagnostic:
    def test_misconfigured_input_is_invalid_value(self):
        # 0-row options query -> the module's own ValueError vocabulary.
        source = SourceFactory(name="source")
        model = SqlModelFactory(
            name="empty_model", sql="SELECT 'x' AS col WHERE 1=0", source="ref(source)"
        )
        input_obj = SingleSelectInputFactory(
            name="empty_input", options="?{ SELECT col FROM ${ref(empty_model)} }"
        )
        project = ProjectFactory(sources=[source], models=[model], inputs=[input_obj])

        result = input_action(input_obj, project.dag(), temp_folder())

        assert result.success is False
        assert result.diagnostic is not None
        assert result.diagnostic.code == "invalid_value"
        assert result.diagnostic.object.type == "input"
        assert result.diagnostic.object.name == "empty_input"

    def test_source_refusal_is_query_execution_failed(self, mocker):
        source = SourceFactory(name="source")
        model = SqlModelFactory(name="m", sql="SELECT 'x' AS col", source="ref(source)")
        input_obj = SingleSelectInputFactory(
            name="query_input", options="?{ SELECT col FROM ${ref(m)} }"
        )
        project = ProjectFactory(sources=[source], models=[model], inputs=[input_obj])
        mocker.patch(
            "visivo.jobs.run_input_job._execute_query_for_options",
            side_effect=RuntimeError("no such table: m"),
        )

        result = input_action(input_obj, project.dag(), temp_folder())

        assert result.success is False
        assert result.diagnostic.code == "query_execution_failed"


class TestSkippedDependencyDiagnostics:
    """M16-1: a failed source-schema job must leave dependency_failed records
    on every runnable job above it — on main the skip is only a log line."""

    def _run(self):
        project = _failing_source_project()
        runner = FilteredRunner(project=project, output_dir=temp_folder(), soft_failure=True)
        runner.run()
        return runner

    def test_the_skipped_insight_gets_a_dependency_failed_diagnostic(self):
        runner = self._run()

        by_name = {d.object.name: d for d in runner.diagnostics}
        insight_diagnostic = by_name["insight1"]
        assert insight_diagnostic.code == "dependency_failed"
        assert insight_diagnostic.object.type == "insight"
        # related[] names the job that actually failed — the source.
        related_names = [r.object.name for r in insight_diagnostic.related if r.object]
        assert related_names == ["bad_source"]

    def test_the_skipped_model_is_recorded_too(self):
        runner = self._run()

        by_name = {d.object.name: d for d in runner.diagnostics}
        model_diagnostic = by_name["model1"]
        assert model_diagnostic.code == "dependency_failed"
        assert model_diagnostic.object.type == "model"
        assert [r.object.name for r in model_diagnostic.related if r.object] == ["bad_source"]

    def test_the_failed_source_keeps_its_own_diagnostic(self):
        runner = self._run()

        by_name = {d.object.name: d for d in runner.diagnostics}
        assert by_name["bad_source"].code in (
            "schema_build_failed",
            "source_connection_failed",
        )

    def test_presentation_nodes_are_not_recorded(self):
        """Charts/dashboards above a failure are not jobs — recording them
        would bury the real failure in derived noise."""
        output_dir = temp_folder()
        project = ProjectFactory()  # full factory chain: dashboard -> ... -> source
        project.sources[0].database = "/nonexistent_dir_w3/nope.sqlite"

        runner = FilteredRunner(project=project, output_dir=output_dir, soft_failure=True)
        runner.run()

        types = {d.object.type for d in runner.diagnostics}
        assert types <= {"source", "model", "insight", "input"}

    def test_summary_line_separates_errors_from_skips(self):
        captured = io.StringIO()
        sys.stdout = captured
        try:
            self._run()
        finally:
            sys.stdout = sys.__stdout__

        assert "with 1 query error(s) (2 dependent job(s) skipped)" in captured.getvalue()

    def test_skipped_results_render_a_skipped_status_not_a_failure(self):
        runner = self._run()
        skipped = [
            r
            for r in runner.failed_job_results
            if r.diagnostic and r.diagnostic.code == "dependency_failed"
        ]
        assert len(skipped) == 2
        for result in skipped:
            assert "SKIPPED" in result.message
