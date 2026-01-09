import pytest
from visivo.models.inputs.input import Input
from visivo.models.inputs.types.single_select import SingleSelectInput
from visivo.models.inputs.types.multi_select import MultiSelectInput
from visivo.models.inputs.types.display import RangeConfig
from visivo.models.base.query_string import QueryString


class TestSingleSelectInput:
    def test_minimal_data(self):
        data = {"name": "single_select_input", "options": ["A", "B"]}
        input_obj = SingleSelectInput(**data)

        assert input_obj.name == "single_select_input"
        assert input_obj.type == "single-select"
        assert input_obj.options == ["A", "B"]

    def test_with_static_options(self):
        data = {
            "name": "static_options",
            "label": "Static",
            "options": ["Test", "Test 1", "Test 2", "Test 3"],
        }
        input_obj = SingleSelectInput(**data)
        dumped = input_obj.model_dump()

        assert input_obj.name == "static_options"
        assert "options" in dumped
        assert dumped["options"] == ["Test", "Test 1", "Test 2", "Test 3"]

    def test_with_query_options(self):
        data = {
            "name": "query_options",
            "label": "query",
            "options": "?{ select distinct(category) from ${ref(products_model)} }",
        }
        input_obj = SingleSelectInput(**data)
        dumped = input_obj.model_dump()

        assert input_obj.name == "query_options"
        assert "options" in dumped
        assert "${ref(products_model)}" in dumped["options"]
        assert "select distinct(category)" in dumped["options"]
        assert "name_hash" in dumped
        assert dumped["name_hash"] == input_obj.name_hash()

    def test_query_multiple_references_fails(self):
        with pytest.raises(ValueError) as exc_info:
            data = {
                "name": "bad_input",
                "options": "?{ select category from ${ref(products)} union select category from ${ref(sales)} }",
            }
            SingleSelectInput(**data)

        assert "references 2 items" in str(exc_info.value)
        assert "must reference exactly one" in str(exc_info.value)

    def test_query_no_reference_fails(self):
        with pytest.raises(ValueError) as exc_info:
            data = {
                "name": "bad_input",
                "options": "?{ select category from products }",
            }
            SingleSelectInput(**data)

        assert "must reference exactly one model" in str(exc_info.value)

    def test_child_items_includes_query_refs(self):
        data = {
            "name": "test_input",
            "options": "?{ select category from ${ref(products)} }",
        }
        input_obj = SingleSelectInput(**data)

        assert isinstance(input_obj.options, QueryString)
        children = input_obj.child_items()

        assert len(children) == 1
        assert "ref(products)" in children

    def test_child_items_empty_for_static_options(self):
        data = {
            "name": "test_input",
            "options": ["Option 1", "Option 2"],
        }
        input_obj = SingleSelectInput(**data)
        children = input_obj.child_items()

        assert len(children) == 0

    def test_static_options_include_name_hash(self):
        data = {
            "name": "category_filter",
            "options": ["Option A", "Option B", "Option C"],
        }
        input_obj = SingleSelectInput(**data)
        dumped = input_obj.model_dump()

        assert dumped["options"] == ["Option A", "Option B", "Option C"]
        assert "name_hash" in dumped
        assert dumped["name_hash"] == input_obj.name_hash()


class TestMultiSelectInput:
    def test_minimal_data_with_options(self):
        data = {"name": "multi_select_input", "options": ["A", "B", "C"]}
        input_obj = MultiSelectInput(**data)

        assert input_obj.name == "multi_select_input"
        assert input_obj.type == "multi-select"
        assert input_obj.options == ["A", "B", "C"]
        assert input_obj.is_list_based()
        assert not input_obj.is_range_based()

    def test_with_range(self):
        data = {
            "name": "price_range",
            "label": "Price Range",
            "range": {"start": 0, "end": 100, "step": 10},
        }
        input_obj = MultiSelectInput(**data)

        assert input_obj.name == "price_range"
        assert input_obj.type == "multi-select"
        assert input_obj.range is not None
        assert input_obj.range.start == 0
        assert input_obj.range.end == 100
        assert input_obj.range.step == 10
        assert input_obj.is_range_based()
        assert not input_obj.is_list_based()

    def test_options_and_range_mutually_exclusive(self):
        with pytest.raises(ValueError) as exc_info:
            data = {
                "name": "bad_input",
                "options": ["A", "B"],
                "range": {"start": 0, "end": 100, "step": 10},
            }
            MultiSelectInput(**data)

        assert "not both" in str(exc_info.value)

    def test_requires_options_or_range(self):
        with pytest.raises(ValueError) as exc_info:
            data = {"name": "bad_input"}
            MultiSelectInput(**data)

        assert "must specify either 'options' or 'range'" in str(exc_info.value)

    def test_with_query_options(self):
        data = {
            "name": "query_options",
            "options": "?{ select distinct(category) from ${ref(products_model)} }",
        }
        input_obj = MultiSelectInput(**data)
        dumped = input_obj.model_dump()

        assert input_obj.name == "query_options"
        assert "${ref(products_model)}" in dumped["options"]

    def test_with_query_range(self):
        data = {
            "name": "dynamic_range",
            "range": {
                "start": "?{ select min(price) from ${ref(products)} }",
                "end": "?{ select max(price) from ${ref(products)} }",
                "step": 10,
            },
        }
        input_obj = MultiSelectInput(**data)

        # Range values can be query strings (stored as str with ?{ } syntax)
        assert "?{" in str(input_obj.range.start)
        assert "?{" in str(input_obj.range.end)
        assert "${ref(products)}" in str(input_obj.range.start)
        assert input_obj.range.step == 10

    def test_child_items_includes_range_query_refs(self):
        data = {
            "name": "dynamic_range",
            "range": {
                "start": "?{ select min(price) from ${ref(products)} }",
                "end": "?{ select max(price) from ${ref(orders)} }",
                "step": 10,
            },
        }
        input_obj = MultiSelectInput(**data)
        children = input_obj.child_items()

        assert len(children) == 2
        assert "ref(products)" in children
        assert "ref(orders)" in children

    def test_child_items_empty_for_static_range(self):
        data = {
            "name": "static_range",
            "range": {"start": 0, "end": 100, "step": 10},
        }
        input_obj = MultiSelectInput(**data)
        children = input_obj.child_items()

        assert len(children) == 0

    def test_serialize_with_name_hash(self):
        data = {
            "name": "multi_input",
            "options": ["A", "B", "C"],
        }
        input_obj = MultiSelectInput(**data)
        dumped = input_obj.model_dump()

        assert "name_hash" in dumped
        assert dumped["name_hash"] == input_obj.name_hash()
