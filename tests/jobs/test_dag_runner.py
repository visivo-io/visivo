"""Tests for dag_runner Input job creation."""

import pytest
from visivo.models.inputs.types.dropdown import DropdownInput
from visivo.models.project import Project
from tests.factories.model_factories import SourceFactory
from tests.support.utils import temp_folder


class TestDagRunnerInputJobs:
    """Test that dag_runner creates jobs for Input items."""

    def test_creates_input_job_for_input_items(self):
        """Verify Input items get run_input_job assigned."""
        # ARRANGE
        source = SourceFactory()
        input_obj = DropdownInput(name="test_input", type="dropdown", options=["A", "B", "C"])
        project = Project(name="test_project", sources=[source], inputs=[input_obj], dashboards=[])
        dag = project.dag()
        output_dir = temp_folder()

        # ACT
        from visivo.jobs.dag_runner import DagRunner

        dag_runner = DagRunner(
            project=project,
            output_dir=output_dir,
            threads=1,
            soft_failure=False,
            server_url="",
            job_dag=project.dag(),
            working_dir=".",
        )

        job_obj = dag_runner.create_jobs_from_item(input_obj)

        # ASSERT
        assert job_obj is not None, "Expected a Job object to be created for Input"
        assert (
            job_obj.item == input_obj
        ), f"Expected job.item to be the input object, got {job_obj.item}"

        # Verify action is from run_input_job
        from visivo.jobs.run_input_job import action as input_action

        assert (
            job_obj.action == input_action
        ), f"Expected job.action to be run_input_job.action, got {job_obj.action}"
