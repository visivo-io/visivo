import pytest
from visivo.models.interaction import InsightInteraction
from tests.factories.model_factories import (
    ProjectFactory,
    InputFactory,
    SqlModelFactory,
)


class TestJSTemplateLiterals:
    def test_filter_with_input_converts_to_template_literal(self):
        """Verify ${ref(input).value} becomes ${input.value}"""
        # ARRANGE
        input_obj = InputFactory(name="min_value", options=["5", "10", "15"])
        interaction = InsightInteraction(filter="?{x > ${ref(min_value).value}}")
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()

        # ACT
        result = interaction.field_values_with_js_template_literals(dag)

        # ASSERT
        assert result["filter"] == "x > ${min_value.value}"
        assert "${ref(min_value).value}" not in result["filter"]

    def test_split_with_input_converts_case_expression(self):
        """Verify CASE with input converts"""
        # ARRANGE
        input_obj = InputFactory(name="threshold", options=["100", "200", "300"])
        interaction = InsightInteraction(
            split="?{CASE WHEN x > ${ref(threshold).value} THEN 'high' ELSE 'low' END}"
        )
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()

        # ACT
        result = interaction.field_values_with_js_template_literals(dag)

        # ASSERT
        assert "${threshold.value}" in result["split"]
        assert "${ref(threshold).value}" not in result["split"]

    def test_sort_with_input_converts(self):
        """Verify sort interaction with input"""
        # ARRANGE
        input_obj = InputFactory(name="sort_field", options=["name", "date", "amount"])
        interaction = InsightInteraction(sort="?{${ref(sort_field).value}}")
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()

        # ACT
        result = interaction.field_values_with_js_template_literals(dag)

        # ASSERT
        assert result["sort"] == "${sort_field.value}"
        assert "${ref(sort_field).value}" not in result["sort"]

    def test_non_input_refs_unchanged(self):
        """Verify model refs are left unchanged"""
        # ARRANGE
        model = SqlModelFactory(name="sales", sql="SELECT 1 as revenue")
        interaction = InsightInteraction(filter="?{${ref(sales).revenue} > 1000}")
        project = ProjectFactory(models=[model])
        dag = project.dag()

        # ACT
        result = interaction.field_values_with_js_template_literals(dag)

        # ASSERT
        # Model ref should remain unchanged
        assert "${ref(sales).revenue}" in result["filter"]

    def test_mixed_input_and_model_refs(self):
        """Verify mixed refs: inputs converted, models unchanged"""
        # ARRANGE
        model = SqlModelFactory(name="data", sql="SELECT 1 as value")
        input_obj = InputFactory(name="threshold", options=["10", "20", "30"])
        interaction = InsightInteraction(filter="?{${ref(data).value} > ${ref(threshold).value}}")
        project = ProjectFactory(models=[model], inputs=[input_obj])
        dag = project.dag()

        # ACT
        result = interaction.field_values_with_js_template_literals(dag)

        # ASSERT
        # Model ref unchanged, input ref converted
        assert "${ref(data).value}" in result["filter"]
        assert "${threshold.value}" in result["filter"]
        assert "${ref(threshold).value}" not in result["filter"]

    def test_multiple_inputs_in_same_expression(self):
        """Verify multiple inputs all converted"""
        # ARRANGE
        input1 = InputFactory(name="min_val", options=["0", "5", "10"])
        input2 = InputFactory(name="max_val", options=["100", "200", "300"])
        interaction = InsightInteraction(
            filter="?{x > ${ref(min_val).value} AND x < ${ref(max_val).value}}"
        )
        project = ProjectFactory(inputs=[input1, input2])
        dag = project.dag()

        # ACT
        result = interaction.field_values_with_js_template_literals(dag)

        # ASSERT
        assert "${min_val.value}" in result["filter"]
        assert "${max_val.value}" in result["filter"]
        assert "${ref(min_val).value}" not in result["filter"]
        assert "${ref(max_val).value}" not in result["filter"]

    def test_no_inputs_returns_unchanged(self):
        """Verify no changes when no inputs"""
        # ARRANGE
        model = SqlModelFactory(name="data", sql="SELECT 1 as x")
        interaction = InsightInteraction(filter="?{${ref(data).x} > 10}")
        project = ProjectFactory(models=[model])
        dag = project.dag()

        # ACT
        result = interaction.field_values_with_js_template_literals(dag)

        # ASSERT
        # Should remain unchanged
        assert result["filter"] == "${ref(data).x} > 10"

    def test_returns_dict_with_filter_split_sort(self):
        """Verify returns dict with correct keys"""
        # ARRANGE
        input_obj = InputFactory(name="val", options=["5", "10", "15"])
        interaction = InsightInteraction(
            filter="?{x > ${ref(val).value}}",
            split="?{category}",
            sort="?{${ref(val).value}}",
        )
        project = ProjectFactory(inputs=[input_obj])
        dag = project.dag()

        # ACT
        result = interaction.field_values_with_js_template_literals(dag)

        # ASSERT
        assert "filter" in result
        assert "split" in result
        assert "sort" in result
        assert result["filter"] == "x > ${val.value}"
        assert result["split"] == "category"
        assert result["sort"] == "${val.value}"


class TestJSTemplateLiteralMethod:
    def test_js_template_literal_method_exists(self):
        """Verify field_values_with_js_template_literals exists (replaces old sanitized method)"""
        interaction = InsightInteraction()
        assert hasattr(
            interaction, "field_values_with_js_template_literals"
        ), "Method should exist for Phase 2"
