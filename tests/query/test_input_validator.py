"""
Unit tests for visivo/query/input_validator.py

Testing SQLGlot validation with input sampling for dynamic insights.
Phase 3 of Input Interaction Implementation.
"""

import pytest
import polars as pl
import os
import tempfile
import shutil
from pathlib import Path

from tests.factories.model_factories import (
    InputFactory,
    InsightFactory,
    SqlModelFactory,
    ProjectFactory,
    SourceFactory,
)
from visivo.models.inputs.types.dropdown import DropdownInput
from visivo.models.insight import Insight
from visivo.models.base.query_string import QueryString
from visivo.query.sql_validation_error import SqlValidationError


# ====================================
# TestInputInjection
# ====================================
class TestInputInjection:
    """Test injection of input values into SQL queries"""

    def test_inject_string_value_as_is(self):
        """Test that string values with quotes are injected AS-IS (no additional quoting)"""
        from visivo.query.input_validator import inject_input_values

        query = "SELECT * FROM products WHERE category = ${category_input}"
        input_values = {"category_input": "'electronics'"}

        result = inject_input_values(query, input_values)

        # Value should be injected AS-IS with quotes included
        assert result == "SELECT * FROM products WHERE category = 'electronics'"
        assert "'electronics'" in result  # Verify quotes are present

    def test_inject_numeric_value(self):
        """Test that numeric values are injected AS-IS"""
        from visivo.query.input_validator import inject_input_values

        query = "SELECT * FROM orders WHERE amount > ${min_amount}"
        input_values = {"min_amount": "1000"}

        result = inject_input_values(query, input_values)

        assert result == "SELECT * FROM orders WHERE amount > 1000"

    def test_inject_float_value(self):
        """Test that float values are injected AS-IS"""
        from visivo.query.input_validator import inject_input_values

        query = "SELECT * FROM metrics WHERE score >= ${threshold}"
        input_values = {"threshold": "0.95"}

        result = inject_input_values(query, input_values)

        assert result == "SELECT * FROM metrics WHERE score >= 0.95"

    def test_inject_bare_string_creates_column_reference(self):
        """Test that bare strings (without quotes) are treated as column references

        This documents the actual SQL behavior: unquoted identifiers are treated
        as column names, not string literals. Input queries must return properly
        formatted values (e.g., 'electronics' not electronics) to get string literals.
        """
        from visivo.query.input_validator import inject_input_values
        from visivo.query.sqlglot_utils import validate_query

        # Bare string without quotes
        query = "SELECT * FROM products WHERE category = ${category_input}"
        input_values = {"category_input": "electronics"}  # Missing quotes!

        result = inject_input_values(query, input_values)

        # Injection works (just string replacement)
        assert result == "SELECT * FROM products WHERE category = electronics"

        # SQLGlot validation passes because 'electronics' is treated as a column name
        # This is valid SQL syntax, but semantically wrong (compares category to column)
        is_valid, error = validate_query(
            result, dialect="duckdb", insight_name="test", raise_on_error=False
        )
        assert is_valid is True  # Passes validation (but semantically incorrect)
        # This test documents why input queries MUST return quoted strings

    def test_inject_multiple_inputs(self):
        """Test injection of multiple input placeholders"""
        from visivo.query.input_validator import inject_input_values

        query = """
        SELECT * FROM sales
        WHERE category = ${category}
          AND amount > ${min_amount}
          AND date >= ${start_date}
        """
        input_values = {
            "category": "'electronics'",
            "min_amount": "500",
            "start_date": "'2024-01-01'",
        }

        result = inject_input_values(query, input_values)

        assert "'electronics'" in result
        assert "500" in result
        assert "'2024-01-01'" in result
        assert "${" not in result  # All placeholders replaced


# ====================================
# TestCombinationGeneration
# ====================================
class TestCombinationGeneration:
    """Test generation of input value combinations for validation"""

    def test_small_combination_space_all_generated(self):
        """Test that small combination spaces generate all combinations"""
        from visivo.query.input_validator import generate_input_combinations

        # 2 * 3 = 6 combinations (well under 96 limit)
        inputs = {
            "category": ["'electronics'", "'books'"],
            "region": ["'east'", "'west'", "'north'"],
        }

        combinations = generate_input_combinations(inputs)

        # Should have exactly 6 combinations
        assert len(combinations) == 6

        # Verify all combinations are present
        expected = [
            {"category": "'electronics'", "region": "'east'"},
            {"category": "'electronics'", "region": "'west'"},
            {"category": "'electronics'", "region": "'north'"},
            {"category": "'books'", "region": "'east'"},
            {"category": "'books'", "region": "'west'"},
            {"category": "'books'", "region": "'north'"},
        ]
        for exp in expected:
            assert exp in combinations

    def test_exact_limit_all_generated(self):
        """Test that exactly 96 combinations returns all (no sampling)"""
        from visivo.query.input_validator import generate_input_combinations

        # 12 * 8 = 96 combinations (exactly at limit)
        inputs = {
            "month": [str(i) for i in range(1, 13)],  # 12 months
            "category": [f"'cat{i}'" for i in range(1, 9)],  # 8 categories
        }

        combinations = generate_input_combinations(inputs)

        # Should have exactly 96 combinations
        assert len(combinations) == 96

    def test_large_combination_space_sampled(self):
        """Test that large combination spaces are sampled to 96"""
        from visivo.query.input_validator import generate_input_combinations

        # 100 * 100 = 10,000 combinations (way over limit)
        inputs = {
            "id": [str(i) for i in range(100)],
            "value": [str(i) for i in range(100)],
        }

        combinations = generate_input_combinations(inputs)

        # Should be sampled to exactly 96
        assert len(combinations) == 96

        # Each combination should have both keys
        for combo in combinations:
            assert "id" in combo
            assert "value" in combo

    def test_single_input_returns_all_values(self):
        """Test that single input with multiple values works correctly"""
        from visivo.query.input_validator import generate_input_combinations

        inputs = {"category": ["'a'", "'b'", "'c'", "'d'"]}

        combinations = generate_input_combinations(inputs)

        # Should have 4 combinations (one for each value)
        assert len(combinations) == 4

        expected = [
            {"category": "'a'"},
            {"category": "'b'"},
            {"category": "'c'"},
            {"category": "'d'"},
        ]
        for exp in expected:
            assert exp in combinations


# ====================================
# TestInputOptionsLoading
# ====================================
class TestInputOptionsLoading:
    """Test loading input options from parquet files"""

    def test_load_static_options_from_parquet(self):
        """Test loading static options from parquet file"""
        from visivo.query.input_validator import get_input_options

        # Create a temp directory and parquet file
        with tempfile.TemporaryDirectory() as tmpdir:
            input_dir = Path(tmpdir) / "inputs"
            input_dir.mkdir()

            # Create input with static options
            input_obj = InputFactory(
                name="category_input", options=["'electronics'", "'books'", "'toys'"]
            )

            # Write options to parquet (column must be named 'option')
            df = pl.DataFrame({"option": input_obj.options})
            parquet_path = input_dir / f"{input_obj.name_hash()}.parquet"
            df.write_parquet(parquet_path)

            # Load options
            options = get_input_options(input_obj, tmpdir)

            assert len(options) == 3
            assert "'electronics'" in options
            assert "'books'" in options
            assert "'toys'" in options

    def test_load_query_options_from_parquet(self):
        """Test loading query-based options from parquet file"""
        from visivo.query.input_validator import get_input_options

        # Create a temp directory and parquet file
        with tempfile.TemporaryDirectory() as tmpdir:
            input_dir = Path(tmpdir) / "inputs"
            input_dir.mkdir()

            # Create input with query options (just use plain options for this test)
            # The query execution already happened, we just need to load from parquet
            input_obj = InputFactory(name="query_input", options=["'a'", "'b'"])

            # Simulate query execution results (as if query was already executed)
            # Column must be named 'option' to match expected parquet structure
            query_results = ["'electronics'", "'books'", "'toys'", "'games'"]
            df = pl.DataFrame({"option": query_results})
            parquet_path = input_dir / f"{input_obj.name_hash()}.parquet"
            df.write_parquet(parquet_path)

            # Load options from parquet (ignores the model definition)
            options = get_input_options(input_obj, tmpdir)

            assert len(options) == 4
            assert "'electronics'" in options
            assert "'games'" in options


# ====================================
# TestValidationIntegration
# ====================================
class TestValidationIntegration:
    """Test full validation flow with insights"""

    def test_validate_simple_filter_with_input(self):
        """Test validation passes for simple filter with input"""
        from visivo.query.input_validator import validate_insight_with_inputs
        from visivo.models.props.insight_props import InsightProps

        # Create a temp directory with input parquet
        with tempfile.TemporaryDirectory() as tmpdir:
            # Setup input
            input_dir = Path(tmpdir) / "inputs"
            input_dir.mkdir()

            input_obj = InputFactory(name="category_input", options=["'electronics'", "'books'"])
            df = pl.DataFrame({"option": input_obj.options})
            parquet_path = input_dir / f"{input_obj.name_hash()}.parquet"
            df.write_parquet(parquet_path)

            # Create project with insight using input
            source = SourceFactory(name="test_source")
            model = SqlModelFactory(name="products", source="ref(test_source)")

            # Create minimal project
            from visivo.models.project import Project
            from visivo.models.insight import Insight

            # Create insight with input reference in props (to make input a dependency)
            insight = Insight(
                name="test_insight",
                props=InsightProps(
                    type="scatter",
                    x="?{${ref(products).id}}",
                    y="?{${ref(products).amount}}",
                    # Reference input in marker to make it a dependency
                    marker={"color": "?{${ref(category_input)}}"},
                ),
            )

            project = Project(
                name="test_project",
                sources=[source],
                models=[model],
                inputs=[input_obj],
                insights=[insight],
            )
            dag = project.dag()

            insight.path = "insights.test_insight"

            # Query with input placeholder
            query = "SELECT * FROM products WHERE category = ${category_input}"

            # Validate - should pass (try different category values)
            validate_insight_with_inputs(
                insight=insight, query=query, dag=dag, output_dir=tmpdir, dialect="duckdb"
            )
            # If no exception raised, validation passed

    def test_validate_catches_syntax_error(self):
        """Test that validation catches SQL syntax errors"""
        from visivo.query.input_validator import validate_insight_with_inputs
        from visivo.models.props.insight_props import InsightProps

        # Create a temp directory with input parquet
        with tempfile.TemporaryDirectory() as tmpdir:
            # Setup input
            input_dir = Path(tmpdir) / "inputs"
            input_dir.mkdir()

            input_obj = InputFactory(name="category_input", options=["'electronics'", "'books'"])
            df = pl.DataFrame({"option": input_obj.options})
            parquet_path = input_dir / f"{input_obj.name_hash()}.parquet"
            df.write_parquet(parquet_path)

            # Create project
            source = SourceFactory(name="test_source")
            model = SqlModelFactory(name="products", source="ref(test_source)")

            from visivo.models.project import Project
            from visivo.models.insight import Insight

            # Create insight with input reference in props (to make input a dependency)
            insight = Insight(
                name="test_insight",
                props=InsightProps(
                    type="scatter",
                    x="?{${ref(products).id}}",
                    y="?{${ref(products).amount}}",
                    # Reference input in marker to make it a dependency
                    marker={"color": "?{${ref(category_input)}}"},
                ),
            )

            project = Project(
                name="test_project",
                sources=[source],
                models=[model],
                inputs=[input_obj],
                insights=[insight],
            )
            dag = project.dag()

            insight.path = "insights.test_insight"

            # Query with SYNTAX ERROR (unmatched parenthesis)
            bad_query = "SELECT * FROM products WHERE (category = ${category_input}"

            # Validation should raise SqlValidationError
            with pytest.raises(SqlValidationError) as exc_info:
                validate_insight_with_inputs(
                    insight=insight,
                    query=bad_query,
                    dag=dag,
                    output_dir=tmpdir,
                    dialect="duckdb",
                )

            # Verify error message contains insight name
            assert "test_insight" in str(exc_info.value)

    def test_validate_raises_if_no_inputs_in_query(self):
        """Test that validation raises error if called with query that has NO input placeholders

        This is a CRITICAL programming error guard - the function should only be called
        when input placeholders exist in the query.
        """
        from visivo.query.input_validator import validate_insight_with_inputs
        from visivo.models.props.insight_props import InsightProps

        # Create a temp directory
        with tempfile.TemporaryDirectory() as tmpdir:
            # Create project
            source = SourceFactory(name="test_source")
            model = SqlModelFactory(name="products", source="ref(test_source)")

            from visivo.models.project import Project
            from visivo.models.insight import Insight

            # Create insight
            insight = Insight(
                name="test_insight",
                props=InsightProps(
                    type="scatter",
                    x="?{${ref(products).id}}",
                    y="?{${ref(products).amount}}",
                ),
            )

            project = Project(
                name="test_project", sources=[source], models=[model], insights=[insight]
            )
            dag = project.dag()

            insight.path = "insights.test_insight"

            # Query WITHOUT any input placeholders (programming error)
            query_without_inputs = "SELECT * FROM products WHERE 1=1"

            # Should raise ValueError (programming error)
            with pytest.raises(ValueError) as exc_info:
                validate_insight_with_inputs(
                    insight=insight,
                    query=query_without_inputs,
                    dag=dag,
                    output_dir=tmpdir,
                    dialect="duckdb",
                )

            # Error message should indicate this is a programming error
            error_msg = str(exc_info.value).lower()
            assert "no input placeholders" in error_msg or "programming error" in error_msg


# ====================================
# Additional Edge Case Tests
# ====================================
class TestEdgeCases:
    """Test edge cases and error handling"""

    def test_inject_with_empty_values(self):
        """Test injection when values dict is empty"""
        from visivo.query.input_validator import inject_input_values

        query = "SELECT * FROM products WHERE category = ${category}"
        input_values = {}

        result = inject_input_values(query, input_values)

        # Placeholder should remain unchanged if no value provided
        assert "${category}" in result

    def test_inject_with_partial_values(self):
        """Test injection when only some placeholders have values"""
        from visivo.query.input_validator import inject_input_values

        query = "SELECT * FROM products WHERE category = ${category} AND region = ${region}"
        input_values = {"category": "'electronics'"}  # Only one value

        result = inject_input_values(query, input_values)

        assert "'electronics'" in result
        assert "${region}" in result  # Should remain unchanged

    def test_empty_input_options_list(self):
        """Test behavior when input has no options"""
        from visivo.query.input_validator import generate_input_combinations

        inputs = {"category": []}  # Empty list

        combinations = generate_input_combinations(inputs)

        # Should return empty list
        assert combinations == []

    def test_multiple_inputs_different_sizes(self):
        """Test combinations with inputs of different sizes"""
        from visivo.query.input_validator import generate_input_combinations

        inputs = {
            "category": ["'a'", "'b'"],  # 2 values
            "region": ["'x'", "'y'", "'z'"],  # 3 values
            "status": ["'active'"],  # 1 value
        }

        combinations = generate_input_combinations(inputs)

        # 2 * 3 * 1 = 6 combinations
        assert len(combinations) == 6

        # Verify all combinations have all keys
        for combo in combinations:
            assert "category" in combo
            assert "region" in combo
            assert "status" in combo
