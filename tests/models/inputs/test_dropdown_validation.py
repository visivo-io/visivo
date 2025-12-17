"""
Tests for SingleSelectInput and MultiSelectInput validation.

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
    SingleSelectInputFactory,
    MultiSelectInputFactory,
)
from visivo.models.inputs.types.single_select import SingleSelectInput
from visivo.models.inputs.types.multi_select import MultiSelectInput
from visivo.models.insight import Insight
from visivo.models.props.insight_props import InsightProps
from visivo.jobs.run_input_job import action


class TestSingleSelectValidation:
    """Test validation of SingleSelectInput query references."""

    def test_rejects_insight_references(self):
        """Verify inputs cannot reference Insights - validated at runtime."""
        source = SourceFactory(name="db")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(db)")
        insight = Insight(name="my_insight", props=InsightProps(type="scatter", x="?{x}", y="?{y}"))
        project = ProjectFactory(
            sources=[source], models=[model], insights=[insight], dashboards=[]
        )
        dag = project.dag()

        input_obj = SingleSelectInput(
            name="bad_input", options="?{ SELECT x FROM ${ref(my_insight)} }"
        )

        with tempfile.TemporaryDirectory() as output_dir:
            result = action(input_obj, dag, output_dir)

        assert result.success is False
        assert "can only reference SqlModel" in result.message
        assert "Insight" in result.message

    def test_rejects_nonexistent_references(self):
        """Verify helpful error for missing models - validated at runtime."""
        source = SourceFactory(name="db")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(db)")
        project = ProjectFactory(sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        input_obj = SingleSelectInput(
            name="bad_input",
            options="?{ SELECT x FROM ${ref(nonexistent)} }",
        )

        with tempfile.TemporaryDirectory() as output_dir:
            result = action(input_obj, dag, output_dir)

        assert result.success is False
        assert "not found" in result.message

    def test_accepts_sqlmodel_references(self, mocker):
        """Verify SqlModel references are allowed."""
        source = SourceFactory(name="db")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(db)")
        project = ProjectFactory(sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        input_obj = SingleSelectInput(name="good_input", options="?{ SELECT x FROM ${ref(data)} }")

        mocker.patch(
            "visivo.jobs.run_input_job.get_source_for_model",
            return_value=mocker.Mock(read_sql=lambda q: [{"x": "option1"}]),
        )

        with tempfile.TemporaryDirectory() as output_dir:
            result = action(input_obj, dag, output_dir)

        assert result.success is True

    def test_rejects_multiple_references(self):
        """Verify error when >1 ref in query - validated at construction time."""
        with pytest.raises(ValueError) as exc_info:
            SingleSelectInput(
                name="bad_input",
                options="?{ SELECT x FROM ${ref(data1)} UNION SELECT x FROM ${ref(data2)} }",
            )

        assert "references 2 items" in str(exc_info.value)
        assert "must reference exactly one" in str(exc_info.value)

    def test_rejects_zero_references(self):
        """Verify error when 0 refs in query - validated at construction time."""
        with pytest.raises(ValueError) as exc_info:
            SingleSelectInput(name="bad_input", options="?{ SELECT x FROM some_table }")

        assert "must reference exactly one model" in str(exc_info.value)

    def test_static_options_skip_validation(self):
        """Verify static inputs not validated."""
        input_obj = SingleSelectInput(
            name="static_input", options=["Option1", "Option2", "Option3"]
        )

        result = input_obj.model_dump()

        assert result is not None
        assert result["options"] == ["Option1", "Option2", "Option3"]

    def test_validation_happens_at_runtime(self):
        """Verify validation happens during job execution, not at construction."""
        source = SourceFactory(name="db")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(db)")
        project = ProjectFactory(sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        input_obj = SingleSelectInput(
            name="bad_input",
            options="?{ SELECT nonexistent_col FROM ${ref(missing)} }",
        )

        with tempfile.TemporaryDirectory() as output_dir:
            result = action(input_obj, dag, output_dir)

        assert result.success is False
        assert "not found" in result.message


class TestMultiSelectValidation:
    """Test validation of MultiSelectInput query references."""

    def test_list_based_rejects_insight_references(self):
        """Verify list-based multi-select cannot reference Insights."""
        source = SourceFactory(name="db")
        model = SqlModelFactory(name="data", sql="SELECT 1 as x", source="ref(db)")
        insight = Insight(name="my_insight", props=InsightProps(type="scatter", x="?{x}", y="?{y}"))
        project = ProjectFactory(
            sources=[source], models=[model], insights=[insight], dashboards=[]
        )
        dag = project.dag()

        input_obj = MultiSelectInput(
            name="bad_input", options="?{ SELECT x FROM ${ref(my_insight)} }"
        )

        with tempfile.TemporaryDirectory() as output_dir:
            result = action(input_obj, dag, output_dir)

        assert result.success is False
        assert "can only reference SqlModel" in result.message

    def test_range_based_accepts_sqlmodel_references(self, mocker):
        """Verify range-based multi-select accepts SqlModel references."""
        source = SourceFactory(name="db")
        model = SqlModelFactory(name="prices", sql="SELECT 100 as price", source="ref(db)")
        project = ProjectFactory(sources=[source], models=[model], dashboards=[])
        dag = project.dag()

        input_obj = MultiSelectInput(
            name="price_range",
            range={
                "start": "?{ SELECT MIN(price) FROM ${ref(prices)} }",
                "end": "?{ SELECT MAX(price) FROM ${ref(prices)} }",
                "step": 10,
            },
        )

        mocker.patch(
            "visivo.jobs.run_input_job.get_source_for_model",
            return_value=mocker.Mock(read_sql=lambda q: [{"MIN(price)": 0}]),
        )

        with tempfile.TemporaryDirectory() as output_dir:
            result = action(input_obj, dag, output_dir)

        assert result.success is True

    def test_static_range_skip_validation(self):
        """Verify static range inputs not validated."""
        input_obj = MultiSelectInput(
            name="static_range",
            range={"start": 0, "end": 100, "step": 10},
        )

        result = input_obj.model_dump()

        assert result is not None
        assert result["range"]["start"] == 0
        assert result["range"]["end"] == 100
