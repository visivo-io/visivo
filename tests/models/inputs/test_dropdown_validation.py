"""
TDD tests for DropdownInput validation refactor.

Tests validate:
1. SqlModel-only references (no Insights allowed)
2. Exactly one reference required
3. Helpful error messages
4. Validation triggered at appropriate times
"""

import pytest
from tests.factories.model_factories import (
    SqlModelFactory,
    ProjectFactory,
    SourceFactory,
)
from visivo.models.inputs.types.dropdown import DropdownInput
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps


class TestDropdownValidation:
    """Test validation of DropdownInput query references."""

    def test_rejects_insight_references(self):
        """Verify inputs cannot reference Insights."""
        # ARRANGE
        source = SourceFactory(name="db")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(db)")
        insight = Insight(name="my_insight", props=InsightProps(type="scatter", x="?{x}", y="?{y}"))
        project = ProjectFactory(
            sources=[source], models=[model], insights=[insight], dashboards=[]
        )
        dag = project.dag()

        input_obj = DropdownInput(name="bad_input", options="?{ SELECT x FROM ${ref(my_insight)} }")

        # ACT & ASSERT
        with pytest.raises(ValueError) as exc_info:
            # Trigger validation via serialization
            input_obj.model_dump(context={"dag": dag})

        # Verify error message mentions SqlModel requirement
        assert "can only reference SqlModel" in str(exc_info.value)
        assert "my_insight" in str(exc_info.value)

    def test_rejects_nonexistent_references(self):
        """Verify helpful error for missing models."""
        # ARRANGE
        source = SourceFactory(name="db")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(db)")
        project = ProjectFactory(sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        input_obj = DropdownInput(
            name="bad_input",
            options="?{ SELECT x FROM ${ref(nonexistent)} }",
        )

        # ACT & ASSERT
        with pytest.raises(ValueError) as exc_info:
            input_obj.model_dump(context={"dag": dag})

        assert "'nonexistent' which was not found" in str(exc_info.value)

    def test_accepts_sqlmodel_references(self):
        """Verify SqlModel references are allowed."""
        # ARRANGE
        source = SourceFactory(name="db")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(db)")
        project = ProjectFactory(sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        input_obj = DropdownInput(name="good_input", options="?{ SELECT x FROM ${ref(data)} }")

        # ACT - should not raise
        result = input_obj.model_dump(context={"dag": dag})

        # ASSERT
        assert result is not None
        assert result["name"] == "good_input"

    def test_rejects_multiple_references(self):
        """Verify error when >1 ref in query."""
        # ARRANGE
        source = SourceFactory(name="db")
        model1 = SqlModelFactory(name="data1", sql="SELECT 1 as x", source="ref(db)")
        model2 = SqlModelFactory(name="data2", sql="SELECT 2 as x", source="ref(db)")
        project = ProjectFactory(sources=[source], models=[model1, model2], dashboards=[])
        dag = project.dag()

        # ACT & ASSERT
        # Validation happens during construction (model_validator)
        with pytest.raises(ValueError) as exc_info:
            input_obj = DropdownInput(
                name="bad_input",
                options="?{ SELECT x FROM ${ref(data1)} UNION SELECT x FROM ${ref(data2)} }",
            )

        assert "references 2 items" in str(exc_info.value)
        assert "must reference exactly one" in str(exc_info.value)

    def test_rejects_zero_references(self):
        """Verify error when 0 refs in query."""
        # ARRANGE
        source = SourceFactory(name="db")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(db)")
        project = ProjectFactory(sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        # ACT & ASSERT
        # Validation happens during construction (model_validator)
        with pytest.raises(ValueError) as exc_info:
            input_obj = DropdownInput(name="bad_input", options="?{ SELECT x FROM some_table }")

        assert "must reference exactly one model" in str(exc_info.value)

    def test_validation_triggered_on_serialization(self):
        """Verify validation runs during model_dump()."""
        # ARRANGE
        source = SourceFactory(name="db")
        insight = Insight(name="my_insight", props=InsightProps(type="scatter", x="?{x}", y="?{y}"))
        project = ProjectFactory(sources=[source], insights=[insight], dashboards=[])
        dag = project.dag()

        input_obj = DropdownInput(name="bad_input", options="?{ SELECT x FROM ${ref(my_insight)} }")

        # ACT & ASSERT
        # Validation should NOT trigger without context
        # Should trigger WITH dag context
        with pytest.raises(ValueError) as exc_info:
            input_obj.model_dump(context={"dag": dag})

        assert "can only reference SqlModel" in str(exc_info.value)

    def test_validation_with_dag_context(self):
        """Verify DAG context enables validation."""
        # ARRANGE
        source = SourceFactory(name="db")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(db)")
        project = ProjectFactory(sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        input_obj = DropdownInput(name="good_input", options="?{ SELECT x FROM ${ref(data)} }")

        # ACT
        # With DAG context - should work
        result_with_dag = input_obj.model_dump(context={"dag": dag})

        # ASSERT
        assert result_with_dag is not None

    def test_static_options_skip_validation(self):
        """Verify static inputs not validated."""
        # ARRANGE
        input_obj = DropdownInput(name="static_input", options=["Option1", "Option2", "Option3"])

        # ACT - should not raise even without DAG
        result = input_obj.model_dump()

        # ASSERT
        assert result is not None
        assert result["options"] == ["Option1", "Option2", "Option3"]

    def test_helpful_error_messages(self):
        """Verify errors mention SqlModel requirement."""
        # ARRANGE
        source = SourceFactory(name="db")
        insight = Insight(name="my_insight", props=InsightProps(type="scatter", x="?{x}", y="?{y}"))
        project = ProjectFactory(sources=[source], insights=[insight], dashboards=[])
        dag = project.dag()

        input_obj = DropdownInput(name="bad_input", options="?{ SELECT x FROM ${ref(my_insight)} }")

        # ACT & ASSERT
        with pytest.raises(ValueError) as exc_info:
            input_obj.model_dump(context={"dag": dag})

        error_msg = str(exc_info.value)
        # Check for helpful guidance
        assert "SqlModel" in error_msg
        assert "my_insight" in error_msg
        # Should explain WHY it's not allowed
        assert any(
            keyword in error_msg.lower()
            for keyword in ["backend", "source", "execute", "build time"]
        )

    def test_validation_happens_compile_time(self):
        """Verify errors happen early (not runtime)."""
        # ARRANGE
        source = SourceFactory(name="db")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(db)")
        project = ProjectFactory(sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        # Create input with query that would fail at runtime (nonexistent column)
        # But validation should catch the missing reference first during serialization
        input_obj = DropdownInput(
            name="bad_input",
            options="?{ SELECT nonexistent_col FROM ${ref(missing)} }",
        )

        # ACT & ASSERT
        # Should fail at serialize time (when DAG is available), not execution time
        with pytest.raises(ValueError) as exc_info:
            input_obj.model_dump(context={"dag": dag})

        # Error should be about missing reference, not column
        assert "not found" in str(exc_info.value)


class TestDropdownPlaceholderForProps:
    """Test that query_placeholder() exists for props but interactions use JS template literals."""

    def test_query_placeholder_method_exists_for_props(self):
        """
        Verify query_placeholder() exists for props sanitization.

        Props use placeholders: '${ref(input)}' -> 'visivo-input-placeholder-string'
        Interactions use JS template literals: '${ref(input)}' -> '${input}'
        """
        input_obj = DropdownInput(name="test", options=["A", "B"])
        assert hasattr(input_obj, "query_placeholder"), "query_placeholder needed for props"

        # Verify it returns the expected format
        placeholder, comment = input_obj.query_placeholder()
        assert placeholder == "'visivo-input-placeholder-string'"
        assert "Input(test)" in comment
