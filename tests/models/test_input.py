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
    """Test dropdown with query options resolves ${ref(...)} to parquet file"""
    from visivo.models.project import Project
    from visivo.models.sources.sqlite_source import SqliteSource
    from visivo.models.insight import Insight
    from visivo.models.props.insight_props import InsightProps

    # Create a minimal project with just a source and insight
    source = SqliteSource(name="test_source", type="sqlite", database="tmp/test.db")
    insight = Insight(
        name="products_insight",
        props=InsightProps(type="scatter", x="?{x}", y="?{y}"),
    )
    project = Project(name="test_project", sources=[source], insights=[insight])
    dag = project.dag()

    # Create input with query-based options
    data = {
        "name": "query_options",
        "label": "query",
        "options": "?{ select distinct(category) from ${ref(products_insight)} }",
    }
    dropdown = DropdownInput(**data)

    # Serialize with DAG context
    dumped = dropdown.model_dump(context={"dag": dag})

    # Verify the input was created correctly
    assert dropdown.name == "query_options"
    assert "options" in dumped
    assert dumped["is_query"] is True

    # Verify ${ref(products_insight)} was resolved to read_parquet
    assert "READ_PARQUET" in dumped["options"].upper()
    assert "files/" in dumped["options"]
    assert ".parquet" in dumped["options"]

    # Verify it's a valid DuckDB query with SELECT DISTINCT
    assert "SELECT" in dumped["options"].upper()
    assert "DISTINCT" in dumped["options"].upper()
    assert "category" in dumped["options"].lower()


def test_query_validation_multiple_columns_fails():
    """Test that queries with multiple columns fail validation"""
    from visivo.models.project import Project
    from visivo.models.sources.sqlite_source import SqliteSource
    from visivo.models.insight import Insight
    from visivo.models.props.insight_props import InsightProps
    import pytest

    source = SqliteSource(name="test_source", type="sqlite", database="tmp/test.db")
    insight = Insight(name="products", props=InsightProps(type="scatter", x="?{x}", y="?{y}"))
    project = Project(name="test_project", sources=[source], insights=[insight])
    dag = project.dag()

    # Query with multiple columns should fail
    data = {
        "name": "bad_input",
        "options": "?{ select category, name from ${ref(products)} }",
    }
    dropdown = DropdownInput(**data)

    with pytest.raises(ValueError) as exc_info:
        dropdown.model_dump(context={"dag": dag})

    assert "must return exactly one column" in str(exc_info.value)
    assert "found 2 columns" in str(exc_info.value)


def test_query_validation_not_select_fails():
    """Test that non-SELECT queries fail validation"""
    from visivo.models.project import Project
    from visivo.models.sources.sqlite_source import SqliteSource
    from visivo.models.insight import Insight
    from visivo.models.props.insight_props import InsightProps
    import pytest

    source = SqliteSource(name="test_source", type="sqlite", database="tmp/test.db")
    insight = Insight(name="products", props=InsightProps(type="scatter", x="?{x}", y="?{y}"))
    project = Project(name="test_project", sources=[source], insights=[insight])
    dag = project.dag()

    # DELETE query should fail
    data = {
        "name": "bad_input",
        "options": "?{ delete from ${ref(products)} }",
    }
    dropdown = DropdownInput(**data)

    with pytest.raises(ValueError) as exc_info:
        dropdown.model_dump(context={"dag": dag})

    assert "must be a SELECT statement" in str(exc_info.value)


def test_query_multiple_references_fails():
    """Test that queries with multiple ${ref(...)} fail"""
    from visivo.models.project import Project
    from visivo.models.sources.sqlite_source import SqliteSource
    from visivo.models.insight import Insight
    from visivo.models.props.insight_props import InsightProps
    import pytest

    source = SqliteSource(name="test_source", type="sqlite", database="tmp/test.db")
    insight1 = Insight(name="products", props=InsightProps(type="scatter", x="?{x}", y="?{y}"))
    insight2 = Insight(name="sales", props=InsightProps(type="scatter", x="?{x}", y="?{y}"))
    project = Project(name="test_project", sources=[source], insights=[insight1, insight2])
    dag = project.dag()

    # Query with two references should fail
    data = {
        "name": "bad_input",
        "options": "?{ select category from ${ref(products)} union select category from ${ref(sales)} }",
    }
    dropdown = DropdownInput(**data)

    with pytest.raises(ValueError) as exc_info:
        dropdown.model_dump(context={"dag": dag})

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

    # Query without any reference should fail
    data = {
        "name": "bad_input",
        "options": "?{ select category from products }",
    }
    dropdown = DropdownInput(**data)

    with pytest.raises(ValueError) as exc_info:
        dropdown.model_dump(context={"dag": dag})

    assert "must reference exactly one model or insight" in str(exc_info.value)


def test_query_nonexistent_reference_fails():
    """Test that queries referencing non-existent items fail"""
    from visivo.models.project import Project
    from visivo.models.sources.sqlite_source import SqliteSource
    import pytest

    source = SqliteSource(name="test_source", type="sqlite", database="tmp/test.db")
    project = Project(name="test_project", sources=[source])
    dag = project.dag()

    # Reference to non-existent item should fail
    data = {
        "name": "bad_input",
        "options": "?{ select category from ${ref(nonexistent)} }",
    }
    dropdown = DropdownInput(**data)

    with pytest.raises(ValueError) as exc_info:
        dropdown.model_dump(context={"dag": dag})

    assert "'nonexistent' which was not found" in str(exc_info.value)


def test_query_with_model_reference():
    """Test that query-based options work with model references too"""
    from visivo.models.project import Project
    from visivo.models.sources.sqlite_source import SqliteSource
    from visivo.models.models.sql_model import SqlModel

    source = SqliteSource(name="test_source", type="sqlite", database="tmp/test.db")
    model = SqlModel(name="products_model", sql="SELECT * FROM products", source="ref(test_source)")
    project = Project(name="test_project", sources=[source], models=[model])
    dag = project.dag()

    data = {
        "name": "category_filter",
        "options": "?{ select distinct category from ${ref(products_model)} }",
    }
    dropdown = DropdownInput(**data)
    dumped = dropdown.model_dump(context={"dag": dag})

    assert dumped["is_query"] is True
    assert "READ_PARQUET" in dumped["options"].upper()
    # Verify the model's hash appears in the parquet file path
    assert model.name_hash() in dumped["options"]


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
