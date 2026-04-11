"""Tests for DeprecationChecker orchestrator."""

from unittest.mock import patch

from visivo.models.deprecations import DeprecationChecker, DeprecationWarning
from visivo.models.project import Project


class TestDeprecationChecker:
    """Tests for the DeprecationChecker orchestrator."""

    def test_check_all_returns_empty_for_clean_project(self):
        project = Project(
            name="test_project",
            dashboards=[],
        )

        checker = DeprecationChecker()
        warnings = checker.check_all(project)

        assert len(warnings) == 0

    def test_report_outputs_nothing_when_no_warnings(self):
        checker = DeprecationChecker()
        checker.report([])

    def test_report_outputs_warnings(self):
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

        with patch("visivo.models.deprecations.deprecation_checker.Logger") as mock_logger:
            mock_instance = mock_logger.instance.return_value
            checker.report(warnings)

            assert mock_instance.warn.call_count >= 3

    def test_checkers_list_is_empty_by_default(self):
        checker = DeprecationChecker()
        assert checker.checkers == []
