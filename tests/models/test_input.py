from unittest.mock import Mock
import pytest
from requests import patch
from visivo.logger.logger import Logger
from visivo.models.inputs.base import Input
from visivo.models.inputs.dropdown import DropdownInput
from visivo.models.base.query_string import QueryString


def test_serialize_without_options():
    """Test serialization when no options attribute exists"""
    input_obj = Input()

    original_data = {"type": "dropdown", "label": "Test Input"}
    mock_serializer = Mock(return_value=original_data.copy())
    mock_info = Mock()
    mock_info.context = {}

    result = input_obj.serialize_model(mock_serializer, mock_info)

    assert result == original_data


def test_dropdown_with_minimal_data():
    """Test dropdown with minimal data"""
    data = {"name": "dropdown_input"}
    dropdown = DropdownInput(**data)

    assert dropdown.name == "dropdown_input"
    assert dropdown.type == "dropdown"
    assert dropdown.options is None


def test_dropdown_with_static_options():
    """Test dropdown with static options"""
    data = {
        "name": "static_options",
        "label": "Static",
        "options": ["Test", "Test 1", "Test 2", "Test 3"],
        "default": "Test",
    }
    dropdown = DropdownInput(**data)
    dumped = dropdown.model_dump()

    assert dropdown.name == "static_options"
    assert "options" in dumped
    assert dumped["options"] == ["Test", "Test 1", "Test 2", "Test 3"]


def test_dropdown_with_query_options():
    """Test dropdown with query options"""
    data = {
        "name": "query_options",
        "label": "query",
        "options": "?{ select distinct(category) from ${ref(products_insight)} }",
    }
    dropdown = DropdownInput(**data)
    dumped = dropdown.model_dump(context={"dag": None})

    assert dropdown.name == "query_options"
    assert "options" in dumped
    assert "SELECT DISTINCT (category)" in dumped["options"]
