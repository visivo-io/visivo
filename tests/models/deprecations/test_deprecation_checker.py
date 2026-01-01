"""Tests for DeprecationChecker orchestrator."""

from io import StringIO
from unittest.mock import patch

from visivo.models.deprecations import DeprecationChecker, DeprecationWarning
from visivo.models.project import Project
from tests.factories.model_factories import (
    SourceFactory,
    TraceFactory,
    SqlModelFactory,
)


class TestDeprecationChecker:
    """Tests for the DeprecationChecker orchestrator."""

    def test_check_all_runs_all_checkers(self):
        """Test that check_all runs all registered checkers."""
        source = SourceFactory()
        trace = TraceFactory(name="my_trace")

        project = Project(
            name="test_project",
            sources=[source],
            traces=[trace],
            dashboards=[],
        )

        checker = DeprecationChecker()
        warnings = checker.check_all(project)

        # Should have at least one warning from TraceDeprecation
        assert len(warnings) >= 1
        assert any(w.feature == "Trace" for w in warnings)

    def test_check_all_returns_empty_for_clean_project(self):
        """Test that a clean project returns no warnings."""
        project = Project(
            name="test_project",
            dashboards=[],
        )

        checker = DeprecationChecker()
        warnings = checker.check_all(project)

        assert len(warnings) == 0

    def test_check_all_combines_warnings_from_multiple_checkers(self):
        """Test that warnings from multiple checkers are combined."""
        source = SourceFactory()
        # Bare ref - triggers RefSyntaxDeprecation
        model = SqlModelFactory(name="orders", source="ref(source)")
        # Trace - triggers TraceDeprecation
        trace = TraceFactory(name="my_trace")

        project = Project(
            name="test_project",
            sources=[source],
            models=[model],
            traces=[trace],
            dashboards=[],
        )

        checker = DeprecationChecker()
        warnings = checker.check_all(project)

        # Should have warnings from both checkers
        features = [w.feature for w in warnings]
        assert "Legacy ref() syntax" in features
        assert "Trace" in features

    def test_report_outputs_nothing_when_no_warnings(self):
        """Test that report outputs nothing when there are no warnings."""
        checker = DeprecationChecker()
        # Should not raise and should produce no output
        checker.report([])

    def test_report_outputs_warnings(self):
        """Test that report outputs warning information."""
        warnings = [
            DeprecationWarning(
                feature="Test Feature",
                message="This is a test warning",
                migration="Do the migration",
                removal_version="1.0.0",
                location="test.yaml:10",
            )
        ]

        checker = DeprecationChecker()

        # Mock the logger to capture output
        with patch("visivo.models.deprecations.deprecation_checker.Logger") as mock_logger:
            mock_instance = mock_logger.instance.return_value
            checker.report(warnings)

            # Verify warn method was called multiple times (header, warnings, footer)
            assert mock_instance.warn.call_count >= 3

    def test_deprecation_checker_has_expected_checkers(self):
        """Test that DeprecationChecker has the expected checkers registered."""
        checker = DeprecationChecker()

        checker_names = [c.__class__.__name__ for c in checker.checkers]
        assert "EnvVarSyntaxDeprecation" in checker_names
        assert "NameFormatDeprecation" in checker_names
        assert "RefSyntaxDeprecation" in checker_names
        assert "TraceDeprecation" in checker_names
