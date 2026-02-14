import pytest
from unittest.mock import patch

from visivo.server.managers.preview_run_manager import PreviewRunManager, PreviewRun, RunStatus


class TestPreviewRunManager:
    """Test suite for PreviewRunManager."""

    @pytest.fixture(autouse=True)
    def reset_singleton(self):
        """Reset the singleton instance before each test."""
        PreviewRunManager._instance = None
        yield
        PreviewRunManager._instance = None

    @pytest.fixture
    def run_manager(self):
        """Create a fresh PreviewRunManager instance."""
        return PreviewRunManager.instance()


class TestInvalidateCompletedRunsForSource(TestPreviewRunManager):
    """Tests for invalidate_completed_runs_for_source method."""

    def test_invalidates_completed_source_runs(self, run_manager):
        """Test that completed source schema runs are invalidated."""
        run_id = run_manager.create_run(
            {"source_name": "test_source", "source_type": "sqlite"},
            object_type="source_schema",
        )
        run_manager.update_status(run_id, RunStatus.COMPLETED)

        assert run_manager.get_run(run_id) is not None

        run_manager.invalidate_completed_runs_for_source("test_source")

        assert run_manager.get_run(run_id) is None

    def test_invalidates_failed_source_runs(self, run_manager):
        """Test that failed source schema runs are invalidated."""
        run_id = run_manager.create_run(
            {"source_name": "test_source", "source_type": "sqlite"},
            object_type="source_schema",
        )
        run_manager.update_status(run_id, RunStatus.FAILED, error="Test error")

        assert run_manager.get_run(run_id) is not None

        run_manager.invalidate_completed_runs_for_source("test_source")

        assert run_manager.get_run(run_id) is None

    def test_does_not_invalidate_running_source_runs(self, run_manager):
        """Test that running source schema runs are not invalidated."""
        run_id = run_manager.create_run(
            {"source_name": "test_source", "source_type": "sqlite"},
            object_type="source_schema",
        )
        run_manager.update_status(run_id, RunStatus.RUNNING)

        run_manager.invalidate_completed_runs_for_source("test_source")

        assert run_manager.get_run(run_id) is not None
        assert run_manager.get_run(run_id).status == RunStatus.RUNNING

    def test_does_not_invalidate_queued_source_runs(self, run_manager):
        """Test that queued source schema runs are not invalidated."""
        run_id = run_manager.create_run(
            {"source_name": "test_source", "source_type": "sqlite"},
            object_type="source_schema",
        )

        run_manager.invalidate_completed_runs_for_source("test_source")

        assert run_manager.get_run(run_id) is not None
        assert run_manager.get_run(run_id).status == RunStatus.QUEUED

    def test_does_not_invalidate_other_sources(self, run_manager):
        """Test that runs for other sources are not invalidated."""
        run_id_1 = run_manager.create_run(
            {"source_name": "source_1", "source_type": "sqlite"},
            object_type="source_schema",
        )
        run_id_2 = run_manager.create_run(
            {"source_name": "source_2", "source_type": "sqlite"},
            object_type="source_schema",
        )
        run_manager.update_status(run_id_1, RunStatus.COMPLETED)
        run_manager.update_status(run_id_2, RunStatus.COMPLETED)

        run_manager.invalidate_completed_runs_for_source("source_1")

        assert run_manager.get_run(run_id_1) is None
        assert run_manager.get_run(run_id_2) is not None

    def test_does_not_invalidate_insight_runs(self, run_manager):
        """Test that insight runs are not invalidated."""
        insight_run_id = run_manager.create_run(
            {"name": "test_source"},
            object_type="insight",
        )
        source_run_id = run_manager.create_run(
            {"source_name": "test_source", "source_type": "sqlite"},
            object_type="source_schema",
        )
        run_manager.update_status(insight_run_id, RunStatus.COMPLETED)
        run_manager.update_status(source_run_id, RunStatus.COMPLETED)

        run_manager.invalidate_completed_runs_for_source("test_source")

        assert run_manager.get_run(insight_run_id) is not None
        assert run_manager.get_run(source_run_id) is None

    def test_invalidates_multiple_completed_runs(self, run_manager):
        """Test that multiple completed runs for the same source are invalidated."""
        run_id_1 = run_manager.create_run(
            {"source_name": "test_source", "source_type": "sqlite", "extra": "a"},
            object_type="source_schema",
        )
        run_id_2 = run_manager.create_run(
            {"source_name": "test_source", "source_type": "sqlite", "extra": "b"},
            object_type="source_schema",
        )
        run_manager.update_status(run_id_1, RunStatus.COMPLETED)
        run_manager.update_status(run_id_2, RunStatus.FAILED)

        run_manager.invalidate_completed_runs_for_source("test_source")

        assert run_manager.get_run(run_id_1) is None
        assert run_manager.get_run(run_id_2) is None
