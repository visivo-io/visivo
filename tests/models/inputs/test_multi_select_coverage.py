"""Coverage-focused behavioral tests for MultiSelectInput.

Exercises the validator error arms and the child_items ref-extraction branches
(query-based options, range fields, and query-based defaults) that the primary
dropdown-validation suite leaves uncovered.
"""

import pytest

from visivo.models.inputs.types.multi_select import MultiSelectInput


class TestValidatorErrorArms:
    def test_query_options_with_zero_refs_raises(self):
        with pytest.raises(ValueError, match="exactly one model"):
            MultiSelectInput(name="regions", options="?{ SELECT DISTINCT region FROM some_table }")

    def test_query_options_with_multiple_refs_raises(self):
        with pytest.raises(ValueError, match="references 2 items"):
            MultiSelectInput(
                name="regions",
                options="?{ SELECT x FROM ${ref(a)} UNION SELECT x FROM ${ref(b)} }",
            )

    def test_empty_static_options_raises(self):
        with pytest.raises(ValueError, match="empty options list"):
            MultiSelectInput(name="regions", options=[])

    def test_list_based_with_range_default_raises(self):
        with pytest.raises(ValueError, match="default uses 'start/end'"):
            MultiSelectInput(
                name="regions",
                options=["East", "West"],
                display={"type": "dropdown", "default": {"start": 0, "end": 10}},
            )

    def test_range_based_with_values_default_raises(self):
        with pytest.raises(ValueError, match="default uses 'values'"):
            MultiSelectInput(
                name="price",
                range={"start": 0, "end": 100, "step": 10},
                display={"type": "range-slider", "default": {"values": [1, 2]}},
            )

    def test_date_range_display_on_list_based_raises(self):
        with pytest.raises(ValueError, match="date-range"):
            MultiSelectInput(
                name="regions",
                options=["East", "West"],
                display={"type": "date-range"},
            )


class TestChildItems:
    def test_query_options_yields_model_ref(self):
        input_obj = MultiSelectInput(
            name="regions", options="?{ SELECT DISTINCT region FROM ${ref(sales)} }"
        )
        assert "ref(sales)" in input_obj.child_items()

    def test_range_query_fields_yield_refs(self):
        input_obj = MultiSelectInput(
            name="price",
            range={
                "start": "?{ SELECT MIN(price) FROM ${ref(products)} }",
                "end": 100,
                "step": 10,
            },
        )
        assert "ref(products)" in input_obj.child_items()

    def test_query_default_values_yield_refs(self):
        # A raw ?{...} string in default.values coerces to a QueryString, so its
        # model ref is pulled into child_items for DAG construction.
        input_obj = MultiSelectInput(
            name="regions",
            options=["East", "West"],
            display={
                "type": "dropdown",
                "default": {"values": "?{ SELECT r FROM ${ref(seed)} }"},
            },
        )
        assert input_obj.child_items() == ["ref(seed)"]


class TestStructureHelpers:
    def test_is_range_based(self):
        input_obj = MultiSelectInput(name="p", range={"start": 0, "end": 10, "step": 1})
        assert input_obj.is_range_based() is True
        assert input_obj.is_list_based() is False

    def test_serializer_marks_structure(self):
        input_obj = MultiSelectInput(name="regions", options=["East", "West"])
        dumped = input_obj.model_dump()
        assert dumped["structure"] == "options"
        assert dumped["options"] == ["East", "West"]
        assert "name_hash" in dumped
