"""Tests for TraceDeprecation checker."""

import os
import tempfile
import textwrap

from visivo.models.deprecations.trace_deprecation import TraceDeprecation
from visivo.models.project import Project
from tests.factories.model_factories import (
    SourceFactory,
    TraceFactory,
    DashboardFactory,
    InsightFactory,
    SqlModelFactory,
)

MODEL_YAML = """\
    models:
      - name: my-model
        sql: "SELECT * FROM t"
"""


class TestTraceDeprecation:
    """Tests for deprecated Trace model detection."""

    def test_no_warning_when_no_traces(self):
        project = Project(
            name="test_project",
            dashboards=[],
            traces=[],
        )

        checker = TraceDeprecation()
        warnings = checker.check(project)
        assert len(warnings) == 0

    def test_warns_on_single_trace(self):
        source = SourceFactory()
        trace = TraceFactory(name="my_trace")

        project = Project(
            name="test_project",
            sources=[source],
            traces=[trace],
            dashboards=[],
        )

        checker = TraceDeprecation()
        warnings = checker.check(project)

        assert len(warnings) == 1
        assert "my_trace" in warnings[0].message
        assert warnings[0].feature == "Trace"
        assert warnings[0].removal_version == "2.0.0"
        assert "Insight" in warnings[0].migration

    def test_warns_on_multiple_traces(self):
        source = SourceFactory()
        trace1 = TraceFactory(
            name="trace_one", model=SqlModelFactory(name="model_one", source="${ref(source)}")
        )
        trace2 = TraceFactory(
            name="trace_two", model=SqlModelFactory(name="model_two", source="${ref(source)}")
        )
        trace3 = TraceFactory(
            name="trace_three", model=SqlModelFactory(name="model_three", source="${ref(source)}")
        )

        project = Project(
            name="test_project",
            sources=[source],
            traces=[trace1, trace2, trace3],
            dashboards=[],
        )

        checker = TraceDeprecation()
        warnings = checker.check(project)

        assert len(warnings) == 3
        trace_names = [w.message for w in warnings]
        assert any("trace_one" in name for name in trace_names)
        assert any("trace_two" in name for name in trace_names)
        assert any("trace_three" in name for name in trace_names)

    def test_insights_do_not_trigger_warnings(self):
        insight = InsightFactory(name="my_insight")

        project = Project(
            name="test_project",
            insights=[insight],
            dashboards=[],
        )

        checker = TraceDeprecation()
        warnings = checker.check(project)

        assert len(warnings) == 0

    def test_warning_includes_trace_path(self):
        source = SourceFactory()
        trace = TraceFactory(name="pathed_trace")

        project = Project(
            name="test_project",
            sources=[source],
            traces=[trace],
            dashboards=[],
        )

        checker = TraceDeprecation()
        warnings = checker.check(project)

        assert len(warnings) == 1
        assert "pathed_trace" in warnings[0].location or warnings[0].location == ""


class TestTraceDeprecationCanMigrate:
    def test_can_migrate_returns_true(self):
        checker = TraceDeprecation()
        assert checker.can_migrate() is True


class TestTraceDeprecationMigration:
    """Tests for automatic trace-to-insight migration."""

    def _write_yaml_files(self, tmpdir, files):
        """Write YAML files to tmpdir and return paths."""
        paths = {}
        for name, content in files.items():
            path = os.path.join(tmpdir, name)
            with open(path, "w") as f:
                f.write(textwrap.dedent(content))
            paths[name] = path
        return paths

    def test_simple_trace_conversion(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._write_yaml_files(
                tmpdir,
                {
                    "project.visivo.yml": """\
                        name: test
                    """,
                    "models.visivo.yml": MODEL_YAML,
                    "traces.visivo.yml": """\
                        traces:
                          - name: my-trace
                            model: ${ref(my-model)}
                            props:
                              type: scatter
                              x: "?{x}"
                              y: "?{y}"
                    """,
                },
            )

            checker = TraceDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 1
            new_content = migrations[0].new_text
            assert "insights:" in new_content
            assert "traces:" not in new_content
            assert "${ref(my-model).x}" in new_content
            assert "${ref(my-model).y}" in new_content

    def test_cohort_on_becomes_split(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._write_yaml_files(
                tmpdir,
                {
                    "project.visivo.yml": """\
                        name: test
                    """,
                    "models.visivo.yml": MODEL_YAML,
                    "traces.visivo.yml": """\
                        traces:
                          - name: my-trace
                            model: ${ref(my-model)}
                            cohort_on: "?{ region }"
                            props:
                              type: bar
                              x: "?{x}"
                              y: "?{y}"
                    """,
                },
            )

            checker = TraceDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 1
            new_content = migrations[0].new_text
            assert "split:" in new_content
            assert "${ref(my-model).region}" in new_content

    def test_filters_become_filter_interactions(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._write_yaml_files(
                tmpdir,
                {
                    "project.visivo.yml": """\
                        name: test
                    """,
                    "models.visivo.yml": MODEL_YAML,
                    "traces.visivo.yml": """\
                        traces:
                          - name: my-trace
                            model: ${ref(my-model)}
                            filters:
                              - "?{x > 1}"
                            props:
                              type: scatter
                              x: "?{x}"
                              y: "?{y}"
                    """,
                },
            )

            checker = TraceDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 1
            new_content = migrations[0].new_text
            assert "filter:" in new_content
            assert "${ref(my-model).x}" in new_content

    def test_order_by_becomes_sort_interactions(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._write_yaml_files(
                tmpdir,
                {
                    "project.visivo.yml": """\
                        name: test
                    """,
                    "models.visivo.yml": MODEL_YAML,
                    "traces.visivo.yml": """\
                        traces:
                          - name: my-trace
                            model: ${ref(my-model)}
                            order_by:
                              - "?{x asc}"
                            props:
                              type: scatter
                              x: "?{x}"
                              y: "?{y}"
                    """,
                },
            )

            checker = TraceDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 1
            new_content = migrations[0].new_text
            assert "sort:" in new_content
            assert "${ref(my-model).x}" in new_content

    def test_skips_traces_with_columns(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._write_yaml_files(
                tmpdir,
                {
                    "project.visivo.yml": """\
                        name: test
                    """,
                    "models.visivo.yml": MODEL_YAML,
                    "traces.visivo.yml": """\
                        traces:
                          - name: column-trace
                            model: ${ref(my-model)}
                            columns:
                              x_data: x
                            props:
                              type: indicator
                              value: column(x_data)[-1]
                    """,
                },
            )

            checker = TraceDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 0

    def test_skips_traces_with_inline_models(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._write_yaml_files(
                tmpdir,
                {
                    "project.visivo.yml": """\
                        name: test
                    """,
                    "traces.visivo.yml": """\
                        traces:
                          - name: inline-trace
                            model:
                              name: inline-model
                              sql: "SELECT * FROM t"
                            props:
                              type: scatter
                              x: "?{x}"
                              y: "?{y}"
                    """,
                },
            )

            checker = TraceDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 0

    def test_skips_traces_referencing_non_sql_models(self):
        """Traces referencing LocalMergeModel or CsvScriptModel should be skipped."""
        with tempfile.TemporaryDirectory() as tmpdir:
            self._write_yaml_files(
                tmpdir,
                {
                    "project.visivo.yml": """\
                        name: test
                    """,
                    "models.visivo.yml": """\
                        models:
                          - name: merge-model
                            sql: "SELECT * FROM a.model JOIN b.model ON a.x = b.x"
                            models:
                              - ${ref(model-a)}
                              - ${ref(model-b)}
                          - name: csv-model
                            args:
                              - echo
                              - "x,y"
                    """,
                    "traces.visivo.yml": """\
                        traces:
                          - name: merge-trace
                            model: ${ref(merge-model)}
                            props:
                              type: scatter
                              x: "?{x}"
                              y: "?{y}"
                          - name: csv-trace
                            model: ${ref(csv-model)}
                            props:
                              type: scatter
                              x: "?{x}"
                              y: "?{y}"
                    """,
                },
            )

            checker = TraceDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 0

    def test_converts_only_eligible_traces(self):
        """Traces with columns are kept, simple traces are converted."""
        with tempfile.TemporaryDirectory() as tmpdir:
            self._write_yaml_files(
                tmpdir,
                {
                    "project.visivo.yml": """\
                        name: test
                    """,
                    "models.visivo.yml": MODEL_YAML,
                    "traces.visivo.yml": """\
                        traces:
                          - name: simple-trace
                            model: ${ref(my-model)}
                            props:
                              type: scatter
                              x: "?{x}"
                              y: "?{y}"
                          - name: column-trace
                            model: ${ref(my-model)}
                            columns:
                              x_data: x
                            props:
                              type: indicator
                              value: column(x_data)[-1]
                    """,
                },
            )

            checker = TraceDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 1
            new_content = migrations[0].new_text
            assert "insights:" in new_content
            assert "traces:" in new_content
            assert "simple-trace" in new_content
            assert "column-trace" in new_content

    def test_updates_chart_trace_refs_to_insight_refs(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._write_yaml_files(
                tmpdir,
                {
                    "project.visivo.yml": """\
                        name: test
                        charts:
                          - name: my-chart
                            traces:
                              - ${ref(my-trace)}
                    """,
                    "models.visivo.yml": MODEL_YAML,
                    "traces.visivo.yml": """\
                        traces:
                          - name: my-trace
                            model: ${ref(my-model)}
                            props:
                              type: scatter
                              x: "?{x}"
                              y: "?{y}"
                    """,
                },
            )

            checker = TraceDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 2

            project_migration = next(m for m in migrations if "project" in m.file_path)
            new_content = project_migration.new_text

            assert "insights:" in new_content
            assert "${ref(my-trace)}" in new_content

    def test_no_migrations_when_no_traces(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._write_yaml_files(
                tmpdir,
                {
                    "project.visivo.yml": """\
                        name: test
                    """,
                    "insights.visivo.yml": """\
                        insights:
                          - name: my-insight
                            props:
                              type: scatter
                              x: "?{${ref(model).x}}"
                              y: "?{${ref(model).y}}"
                    """,
                },
            )

            checker = TraceDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 0

    def test_complex_sql_expression_transformation(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            self._write_yaml_files(
                tmpdir,
                {
                    "project.visivo.yml": """\
                        name: test
                    """,
                    "models.visivo.yml": MODEL_YAML,
                    "traces.visivo.yml": """\
                        traces:
                          - name: complex-trace
                            model: ${ref(my-model)}
                            props:
                              type: bar
                              x: "?{ CASE WHEN x <= 3 THEN 'less' else 'More' END }"
                              y: "?{ avg(y) }"
                    """,
                },
            )

            checker = TraceDeprecation()
            migrations = checker.get_migrations_from_files(tmpdir)

            assert len(migrations) == 1
            new_content = migrations[0].new_text
            assert "${ref(my-model).x}" in new_content
            assert "${ref(my-model).y}" in new_content


class TestTransformExpression:
    """Unit tests for the SQL expression transformation logic."""

    def setup_method(self):
        self.checker = TraceDeprecation()

    def test_simple_column(self):
        result = self.checker._transform_expression("x", "model")
        assert "${ref(model).x}" in result

    def test_aggregate_function(self):
        result = self.checker._transform_expression("avg(y)", "model")
        assert "${ref(model).y}" in result

    def test_case_expression(self):
        result = self.checker._transform_expression(
            "CASE WHEN x <= 3 THEN 'less' else 'More' END", "model"
        )
        assert "${ref(model).x}" in result
        assert "'less'" in result or "less" in result

    def test_arithmetic_expression(self):
        result = self.checker._transform_expression("x * y + 30", "model")
        assert "${ref(model).x}" in result
        assert "${ref(model).y}" in result

    def test_string_concatenation(self):
        result = self.checker._transform_expression("'Position:' || x", "model")
        assert "${ref(model).x}" in result
        assert "Position:" in result

    def test_no_columns(self):
        result = self.checker._transform_expression("42", "model")
        assert result == "42"

    def test_invalid_sql_returns_original(self):
        result = self.checker._transform_expression("not valid sql {{{}}", "model")
        assert result == "not valid sql {{{}}"


class TestTransformOrderBy:
    """Unit tests for order by expression transformation."""

    def setup_method(self):
        self.checker = TraceDeprecation()

    def test_simple_order_asc(self):
        result = self.checker._transform_order_by("x asc", "model")
        assert "${ref(model).x}" in result
        assert "ASC" in result.upper()

    def test_simple_order_desc(self):
        result = self.checker._transform_order_by("x desc", "model")
        assert "${ref(model).x}" in result
        assert "DESC" in result.upper()


class TestExtractModelName:
    """Unit tests for model name extraction."""

    def setup_method(self):
        self.checker = TraceDeprecation()

    def test_context_ref(self):
        assert self.checker._extract_model_name("${ref(my-model)}") == "my-model"

    def test_bare_ref(self):
        assert self.checker._extract_model_name("ref(my-model)") == "my-model"

    def test_ref_with_spaces(self):
        assert self.checker._extract_model_name("${ ref(my-model) }") == "my-model"

    def test_quoted_ref(self):
        assert self.checker._extract_model_name("${ref('my-model')}") == "my-model"

    def test_no_ref(self):
        assert self.checker._extract_model_name("just a string") is None


class TestIsSqlModel:
    """Unit tests for SQL model detection."""

    def setup_method(self):
        self.checker = TraceDeprecation()

    def test_sql_model(self):
        assert self.checker._is_sql_model({"name": "m", "sql": "SELECT 1"}) is True

    def test_local_merge_model(self):
        assert (
            self.checker._is_sql_model({"name": "m", "sql": "SELECT 1", "models": ["ref(a)"]})
            is False
        )

    def test_csv_script_model(self):
        assert self.checker._is_sql_model({"name": "m", "args": ["echo", "x,y"]}) is False

    def test_not_a_dict(self):
        assert self.checker._is_sql_model("ref(m)") is False
