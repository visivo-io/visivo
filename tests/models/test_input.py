import pytest
from visivo.models.inputs.input import Input
from visivo.models.inputs.types.dropdown import DropdownInput
from visivo.models.base.query_string import QueryString


def test_serialize_without_options():
    """Test serialization when no options attribute exists"""
    input_obj = Input(name="test_input", label="Test Input")

    # Use standard Pydantic serialization (no custom serializer in base class)
    result = input_obj.model_dump()

    assert result["name"] == "test_input"
    assert result["label"] == "Test Input"
    assert result["type"] == "dropdown"
    assert "options" not in result  # Base Input has no options field


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
    """Test dropdown with query options serializes the query string and adds name_hash"""
    # Create input with query-based options
    data = {
        "name": "query_options",
        "label": "query",
        "options": "?{ select distinct(category) from ${ref(products_model)} }",
    }
    dropdown = DropdownInput(**data)

    # Serialize (no DAG context needed anymore)
    dumped = dropdown.model_dump()

    # Verify the input was created correctly
    assert dropdown.name == "query_options"

    # Options should be the query string (QueryString serializes via its schema)
    assert "options" in dumped
    assert "${ref(products_model)}" in dumped["options"]
    assert "select distinct(category)" in dumped["options"]

    # name_hash should be present for viewer to fetch parquet file
    assert "name_hash" in dumped
    assert dumped["name_hash"] == dropdown.name_hash()


def test_query_options_serialize_without_dag():
    """Test that query options serialize without needing DAG context.

    Query validation (column count, SELECT statement, etc.) now happens
    in the run phase via run_input_job.py, not at serialization time.
    """
    # Query with multiple columns should serialize fine (validation happens at run time)
    data = {
        "name": "multi_column_input",
        "options": "?{ select category, name from ${ref(products)} }",
    }
    dropdown = DropdownInput(**data)
    dumped = dropdown.model_dump()

    # Should serialize the query string as-is
    assert "options" in dumped
    assert "category, name" in dumped["options"]
    assert "name_hash" in dumped


def test_query_multiple_references_fails():
    """Test that queries with multiple ${ref(...)} fail"""
    from visivo.models.project import Project
    from visivo.models.sources.sqlite_source import SqliteSource
    from visivo.models.models.sql_model import SqlModel
    import pytest

    source = SqliteSource(name="test_source", type="sqlite", database="tmp/test.db")
    model1 = SqlModel(name="products", sql="SELECT * FROM products", source="ref(test_source)")
    model2 = SqlModel(name="sales", sql="SELECT * FROM sales", source="ref(test_source)")
    project = Project(name="test_project", sources=[source], models=[model1, model2])
    dag = project.dag()

    # Query with two references should fail during construction (model_validator)
    with pytest.raises(ValueError) as exc_info:
        data = {
            "name": "bad_input",
            "options": "?{ select category from ${ref(products)} union select category from ${ref(sales)} }",
        }
        dropdown = DropdownInput(**data)

    assert "references 2 items" in str(exc_info.value)
    assert "must reference exactly one" in str(exc_info.value)


def test_query_no_reference_fails():
    """Test that queries without ${ref(...)} fail"""
    from visivo.models.project import Project
    from visivo.models.sources.sqlite_source import SqliteSource
    import pytest

    source = SqliteSource(name="test_source", type="sqlite", database="tmp/test.db")
    project = Project(name="test_project", sources=[source])
    dag = project.dag()

    # Query without any reference should fail during construction (model_validator)
    with pytest.raises(ValueError) as exc_info:
        data = {
            "name": "bad_input",
            "options": "?{ select category from products }",
        }
        dropdown = DropdownInput(**data)

    assert "must reference exactly one model" in str(exc_info.value)


def test_query_reference_serializes_without_validation():
    """Test that query options with any reference serialize without DAG validation.

    Reference validation (existence, type) now happens in the run phase
    via run_input_job.py, not at serialization time.
    """
    # Reference to nonexistent item should serialize fine (validation at run time)
    data = {
        "name": "test_input",
        "options": "?{ select category from ${ref(nonexistent)} }",
    }
    dropdown = DropdownInput(**data)
    dumped = dropdown.model_dump()

    # Should serialize the query string as-is
    assert "options" in dumped
    assert "${ref(nonexistent)}" in dumped["options"]
    assert "name_hash" in dumped


def test_static_options_include_name_hash():
    """Test that static options also include name_hash for consistency"""
    data = {
        "name": "category_filter",
        "options": ["Option A", "Option B", "Option C"],
    }
    dropdown = DropdownInput(**data)
    dumped = dropdown.model_dump()

    assert dumped["options"] == ["Option A", "Option B", "Option C"]
    assert "name_hash" in dumped
    assert dumped["name_hash"] == dropdown.name_hash()


def test_child_items_includes_query_refs():
    """Test that child_items() returns query reference dependencies"""
    from visivo.models.base.query_string import QueryString

    data = {
        "name": "test_input",
        "options": "?{ select category from ${ref(products)} }",
    }
    dropdown = DropdownInput(**data)

    # Verify options was deserialized to QueryString
    assert isinstance(dropdown.options, QueryString)

    children = dropdown.child_items()

    assert len(children) == 1
    assert "ref(products)" in children


def test_child_items_empty_for_static_options():
    """Test that child_items() returns empty list for static options"""
    data = {
        "name": "test_input",
        "options": ["Option 1", "Option 2"],
    }
    dropdown = DropdownInput(**data)

    children = dropdown.child_items()

    assert len(children) == 0
