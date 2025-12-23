"""Tests for TraceDeprecation checker."""

from visivo.models.deprecations.trace_deprecation import TraceDeprecation
from visivo.models.project import Project
from tests.factories.model_factories import (
    SourceFactory,
    TraceFactory,
    DashboardFactory,
    InsightFactory,
    SqlModelFactory,
)


class TestTraceDeprecation:
    """Tests for deprecated Trace model detection."""

    def test_no_warning_when_no_traces(self):
        """Test that project without traces has no warnings."""
        project = Project(
            name="test_project",
            dashboards=[],
            traces=[],
        )

        checker = TraceDeprecation()
        warnings = checker.check(project)
        assert len(warnings) == 0

    def test_warns_on_single_trace(self):
        """Test that a single trace triggers a warning."""
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
        assert warnings[0].removal_version == "0.6.0"
        assert "Insight" in warnings[0].migration

    def test_warns_on_multiple_traces(self):
        """Test that multiple traces each trigger a warning."""
        source = SourceFactory()
        # Use unique model names for each trace to avoid validation errors
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
        """Test that Insights (the replacement) don't trigger warnings."""
        insight = InsightFactory(name="my_insight")

        project = Project(
            name="test_project",
            insights=[insight],
            dashboards=[],
        )

        checker = TraceDeprecation()
        warnings = checker.check(project)

        # Insights should not trigger deprecation warnings
        assert len(warnings) == 0

    def test_warning_includes_trace_path(self):
        """Test that warning includes trace path when available."""
        source = SourceFactory()
        trace = TraceFactory(name="pathed_trace")
        trace.path = "traces/pathed_trace.yaml"

        project = Project(
            name="test_project",
            sources=[source],
            traces=[trace],
            dashboards=[],
        )

        checker = TraceDeprecation()
        warnings = checker.check(project)

        assert len(warnings) == 1
        assert warnings[0].location == "traces/pathed_trace.yaml"
