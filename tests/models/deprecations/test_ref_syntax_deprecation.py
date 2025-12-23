"""Tests for RefSyntaxDeprecation checker."""

from visivo.models.deprecations.ref_syntax_deprecation import RefSyntaxDeprecation
from visivo.models.project import Project
from visivo.models.models.sql_model import SqlModel
from visivo.models.chart import Chart
from visivo.models.dashboard import Dashboard
from visivo.models.row import Row
from visivo.models.item import Item
from tests.factories.model_factories import (
    SourceFactory,
    TraceFactory,
    ChartFactory,
    DashboardFactory,
)


class TestRefSyntaxDeprecation:
    """Tests for deprecated ref() syntax detection."""

    def test_no_warning_on_context_string_ref(self):
        """Test that ${ref(name)} syntax does not trigger warning."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="${ref(source)}",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        checker = RefSyntaxDeprecation()
        warnings = checker.check(project)
        assert len(warnings) == 0

    def test_warns_on_bare_ref_in_model_source(self):
        """Test that bare ref(name) syntax in model source triggers warning."""
        source = SourceFactory()
        model = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="ref(source)",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            dashboards=[],
        )

        checker = RefSyntaxDeprecation()
        warnings = checker.check(project)

        assert len(warnings) == 1
        assert "ref(source)" in warnings[0].message
        assert warnings[0].feature == "Raw ref() syntax"
        assert warnings[0].removal_version == "0.5.0"
        assert "${ref(source)}" in warnings[0].migration

    def test_warns_on_multiple_bare_refs(self):
        """Test that multiple bare refs each trigger a warning."""
        source = SourceFactory()
        model1 = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="ref(source)",
        )
        model2 = SqlModel(
            name="users",
            sql="SELECT * FROM users",
            source="ref(source)",
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model1, model2],
            dashboards=[],
        )

        checker = RefSyntaxDeprecation()
        warnings = checker.check(project)

        # Each model has a bare ref
        assert len(warnings) == 2

    def test_no_warning_for_empty_project(self):
        """Test that empty project has no warnings."""
        project = Project(
            name="test_project",
            dashboards=[],
        )

        checker = RefSyntaxDeprecation()
        warnings = checker.check(project)
        assert len(warnings) == 0

    def test_mixed_syntax_only_warns_on_bare_refs(self):
        """Test that only bare refs generate warnings, not context strings."""
        source = SourceFactory()
        model1 = SqlModel(
            name="orders",
            sql="SELECT * FROM orders",
            source="ref(source)",  # This should warn
        )
        model2 = SqlModel(
            name="users",
            sql="SELECT * FROM users",
            source="${ref(source)}",  # This should not warn
        )

        project = Project(
            name="test_project",
            sources=[source],
            models=[model1, model2],
            dashboards=[],
        )

        checker = RefSyntaxDeprecation()
        warnings = checker.check(project)

        assert len(warnings) == 1
        assert "ref(source)" in warnings[0].message
