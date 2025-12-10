"""
TDD tests for DropdownInput validation.

Tests validate:
1. SqlModel-only references (no Insights allowed) - at runtime via job execution
2. Exactly one reference required - at construction time
3. Helpful error messages
4. Validation triggered at appropriate times
"""

import tempfile
import pytest
from tests.factories.model_factories import (
    SqlModelFactory,
    ProjectFactory,
    SourceFactory,
)
from visivo.models.inputs.types.dropdown import DropdownInput
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.jobs.run_input_job import action


class TestDropdownValidation:
    """Test validation of DropdownInput query references."""

    def test_rejects_insight_references(self):
        """Verify inputs cannot reference Insights - validated at runtime."""
        # ARRANGE
        source = SourceFactory(name="db")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(db)")
        insight = Insight(name="my_insight", props=InsightProps(type="scatter", x="?{x}", y="?{y}"))
        project = ProjectFactory(
            sources=[source], models=[model], insights=[insight], dashboards=[]
        )
        dag = project.dag()

        input_obj = DropdownInput(name="bad_input", options="?{ SELECT x FROM ${ref(my_insight)} }")

        # ACT
        with tempfile.TemporaryDirectory() as output_dir:
            result = action(input_obj, dag, output_dir)

        # ASSERT
        assert result.success is False
        assert "can only reference SqlModel" in result.message
        assert "Insight" in result.message  # Error mentions the type, not the name

    def test_rejects_nonexistent_references(self):
        """Verify helpful error for missing models - validated at runtime."""
        # ARRANGE
        source = SourceFactory(name="db")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(db)")
        project = ProjectFactory(sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        input_obj = DropdownInput(
            name="bad_input",
            options="?{ SELECT x FROM ${ref(nonexistent)} }",
        )

        # ACT
        with tempfile.TemporaryDirectory() as output_dir:
            result = action(input_obj, dag, output_dir)

        # ASSERT
        assert result.success is False
        assert "not found" in result.message

    def test_accepts_sqlmodel_references(self, mocker):
        """Verify SqlModel references are allowed."""
        # ARRANGE
        source = SourceFactory(name="db")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(db)")
        project = ProjectFactory(sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        input_obj = DropdownInput(name="good_input", options="?{ SELECT x FROM ${ref(data)} }")

        # Mock source.read_sql to return valid data
        mocker.patch(
            "visivo.jobs.run_input_job.get_source_for_model",
            return_value=mocker.Mock(read_sql=lambda q: [{"x": "option1"}]),
        )

        # ACT
        with tempfile.TemporaryDirectory() as output_dir:
            result = action(input_obj, dag, output_dir)

        # ASSERT
        assert result.success is True

    def test_rejects_multiple_references(self):
        """Verify error when >1 ref in query - validated at construction time."""
        # ARRANGE & ACT & ASSERT
        # Validation happens during construction (model_validator)
        with pytest.raises(ValueError) as exc_info:
            DropdownInput(
                name="bad_input",
                options="?{ SELECT x FROM ${ref(data1)} UNION SELECT x FROM ${ref(data2)} }",
            )

        assert "references 2 items" in str(exc_info.value)
        assert "must reference exactly one" in str(exc_info.value)

    def test_rejects_zero_references(self):
        """Verify error when 0 refs in query - validated at construction time."""
        # ARRANGE & ACT & ASSERT
        # Validation happens during construction (model_validator)
        with pytest.raises(ValueError) as exc_info:
            DropdownInput(name="bad_input", options="?{ SELECT x FROM some_table }")

        assert "must reference exactly one model" in str(exc_info.value)

    def test_static_options_skip_validation(self):
        """Verify static inputs not validated."""
        # ARRANGE
        input_obj = DropdownInput(name="static_input", options=["Option1", "Option2", "Option3"])

        # ACT - should not raise even without DAG
        result = input_obj.model_dump()

        # ASSERT
        assert result is not None
        assert result["options"] == ["Option1", "Option2", "Option3"]

    def test_validation_happens_at_runtime(self):
        """Verify validation happens during job execution, not at construction."""
        # ARRANGE
        source = SourceFactory(name="db")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(db)")
        project = ProjectFactory(sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        # Create input with query that references non-existent model
        # Construction should succeed (only ref count is validated at construction)
        input_obj = DropdownInput(
            name="bad_input",
            options="?{ SELECT nonexistent_col FROM ${ref(missing)} }",
        )

        # ACT
        # Runtime validation should catch the missing reference
        with tempfile.TemporaryDirectory() as output_dir:
            result = action(input_obj, dag, output_dir)

        # ASSERT
        assert result.success is False
        assert "not found" in result.message
