"""
Unit tests for visivo/query/input_validator.py

Testing SQLGlot validation with input sampling for dynamic insights.
"""

import pytest
import json
import tempfile
from pathlib import Path

from tests.factories.model_factories import (
    SingleSelectInputFactory,
    MultiSelectInputFactory,
    InsightFactory,
    SqlModelFactory,
    ProjectFactory,
    SourceFactory,
)
from visivo.models.inputs.types.single_select import SingleSelectInput
from visivo.models.inputs.types.multi_select import MultiSelectInput
from visivo.models.insight import Insight
from visivo.models.base.query_string import QueryString
from visivo.query.sql_validation_error import SqlValidationError


class TestInputAccessorInjection:
    """Test injection of input accessor values into SQL queries"""

    def test_inject_single_select_value(self):
        """Test that single-select .value accessor is injected correctly"""
        from visivo.query.input_validator import inject_input_accessor_values

        query = "SELECT * FROM products WHERE category = ${category.value}"
        input_values = {"category": {"value": "'electronics'"}}

        result = inject_input_accessor_values(query, input_values)

        assert result == "SELECT * FROM products WHERE category = 'electronics'"

    def test_inject_multi_select_values(self):
        """Test that multi-select .values accessor is injected correctly"""
        from visivo.query.input_validator import inject_input_accessor_values

        query = "SELECT * FROM products WHERE category IN (${categories.values})"
        input_values = {"categories": {"values": "'electronics','books'"}}

        result = inject_input_accessor_values(query, input_values)

        assert result == "SELECT * FROM products WHERE category IN ('electronics','books')"

    def test_inject_multi_select_min_max(self):
        """Test that multi-select .min and .max accessors are injected correctly"""
        from visivo.query.input_validator import inject_input_accessor_values

        query = "SELECT * FROM orders WHERE amount BETWEEN ${price.min} AND ${price.max}"
        input_values = {"price": {"min": "100", "max": "500"}}

        result = inject_input_accessor_values(query, input_values)

        assert result == "SELECT * FROM orders WHERE amount BETWEEN 100 AND 500"

    def test_inject_multiple_accessors_same_input(self):
        """Test multiple accessors for same input"""
        from visivo.query.input_validator import inject_input_accessor_values

        query = """
        SELECT * FROM sales
        WHERE date >= ${date_range.first}
          AND date <= ${date_range.last}
        """
        input_values = {
            "date_range": {
                "first": "'2024-01-01'",
                "last": "'2024-12-31'",
            }
        }

        result = inject_input_accessor_values(query, input_values)

        assert "'2024-01-01'" in result
        assert "'2024-12-31'" in result
        assert "${" not in result

    def test_inject_with_missing_accessor_preserves_placeholder(self):
        """Test that missing accessor preserves placeholder"""
        from visivo.query.input_validator import inject_input_accessor_values

        query = "SELECT * FROM products WHERE category = ${category.value}"
        input_values = {"other": {"value": "test"}}

        result = inject_input_accessor_values(query, input_values)

        assert "${category.value}" in result


class TestCombinationGeneration:
    """Test generation of input value combinations for validation"""

    def test_small_combination_space_all_generated(self):
        """Test that small combination spaces generate all combinations"""
        from visivo.query.input_validator import generate_input_combinations

        inputs = {
            "category": ["'electronics'", "'books'"],
            "region": ["'east'", "'west'", "'north'"],
        }

        combinations = generate_input_combinations(inputs)

        assert len(combinations) == 6

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

        inputs = {
            "month": [str(i) for i in range(1, 13)],
            "category": [f"'cat{i}'" for i in range(1, 9)],
        }

        combinations = generate_input_combinations(inputs)

        assert len(combinations) == 96

    def test_large_combination_space_sampled(self):
        """Test that large combination spaces are sampled to 96"""
        from visivo.query.input_validator import generate_input_combinations

        inputs = {
            "id": [str(i) for i in range(100)],
            "value": [str(i) for i in range(100)],
        }

        combinations = generate_input_combinations(inputs)

        assert len(combinations) == 96

        for combo in combinations:
            assert "id" in combo
            assert "value" in combo


class TestInputOptionsLoading:
    """Test loading input options from JSON files"""

    def test_load_options_from_json(self):
        """Test loading options from JSON file"""
        from visivo.query.input_validator import get_input_options

        with tempfile.TemporaryDirectory() as tmpdir:
            input_dir = Path(tmpdir) / "inputs"
            input_dir.mkdir()

            input_obj = SingleSelectInputFactory(
                name="category_input", options=["electronics", "books", "toys"]
            )

            json_data = {
                "input_name": input_obj.name,
                "input_hash": input_obj.name_hash(),
                "type": "single-select",
                "structure": "options",
                "results": {
                    "options": ["electronics", "books", "toys"],
                    "display": {"type": "dropdown", "default": {"value": "electronics"}},
                },
            }
            json_path = input_dir / f"{input_obj.name_hash()}.json"
            with open(json_path, "w") as f:
                json.dump(json_data, f)

            options = get_input_options(input_obj, tmpdir)

            assert len(options) == 3
            assert "electronics" in options
            assert "books" in options
            assert "toys" in options

    def test_load_range_from_json(self):
        """Test loading range-based input from JSON file"""
        from visivo.query.input_validator import get_input_options

        with tempfile.TemporaryDirectory() as tmpdir:
            input_dir = Path(tmpdir) / "inputs"
            input_dir.mkdir()

            input_obj = MultiSelectInputFactory(
                name="price_range",
                options=None,
                range={"start": 0, "end": 100, "step": 10},
            )

            json_data = {
                "input_name": input_obj.name,
                "input_hash": input_obj.name_hash(),
                "type": "multi-select",
                "structure": "range",
                "results": {
                    "range": {"start": 0, "end": 100, "step": 10},
                    "display": {"type": "range-slider", "default": {"start": 0, "end": 100}},
                },
            }
            json_path = input_dir / f"{input_obj.name_hash()}.json"
            with open(json_path, "w") as f:
                json.dump(json_data, f)

            options = get_input_options(input_obj, tmpdir)

            # Range options return start and end as floats
            assert len(options) == 2
            assert "0.0" in options or "0" in options
            assert "100.0" in options or "100" in options


class TestValidationIntegration:
    """Test full validation flow with insights"""

    def test_validate_simple_filter_with_input(self):
        """Test validation passes for simple filter with single-select input"""
        from visivo.query.input_validator import validate_insight_with_inputs
        from visivo.models.props.insight_props import InsightProps

        with tempfile.TemporaryDirectory() as tmpdir:
            input_dir = Path(tmpdir) / "inputs"
            input_dir.mkdir()

            input_obj = SingleSelectInputFactory(
                name="category_input", options=["electronics", "books"]
            )

            json_data = {
                "input_name": input_obj.name,
                "input_hash": input_obj.name_hash(),
                "type": "single-select",
                "structure": "options",
                "results": {"options": ["electronics", "books"]},
            }
            json_path = input_dir / f"{input_obj.name_hash()}.json"
            with open(json_path, "w") as f:
                json.dump(json_data, f)

            source = SourceFactory(name="test_source")
            model = SqlModelFactory(name="products", source="ref(test_source)")

            from visivo.models.project import Project

            insight = Insight(
                name="test_insight",
                props=InsightProps(
                    type="scatter",
                    x="?{${ref(products).id}}",
                    y="?{${ref(products).amount}}",
                    marker={"color": "?{${ref(category_input).value}}"},
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

            # Query in frontend format (after JS template literal conversion)
            query = "SELECT * FROM products WHERE category = ${category_input.value}"

            validate_insight_with_inputs(
                insight=insight, query=query, dag=dag, output_dir=tmpdir, dialect="duckdb"
            )

    def test_validate_catches_syntax_error(self):
        """Test that validation catches SQL syntax errors"""
        from visivo.query.input_validator import validate_insight_with_inputs
        from visivo.models.props.insight_props import InsightProps

        with tempfile.TemporaryDirectory() as tmpdir:
            input_dir = Path(tmpdir) / "inputs"
            input_dir.mkdir()

            input_obj = SingleSelectInputFactory(
                name="category_input", options=["electronics", "books"]
            )

            json_data = {
                "input_name": input_obj.name,
                "input_hash": input_obj.name_hash(),
                "type": "single-select",
                "structure": "options",
                "results": {"options": ["electronics", "books"]},
            }
            json_path = input_dir / f"{input_obj.name_hash()}.json"
            with open(json_path, "w") as f:
                json.dump(json_data, f)

            source = SourceFactory(name="test_source")
            model = SqlModelFactory(name="products", source="ref(test_source)")

            from visivo.models.project import Project

            insight = Insight(
                name="test_insight",
                props=InsightProps(
                    type="scatter",
                    x="?{${ref(products).id}}",
                    y="?{${ref(products).amount}}",
                    marker={"color": "?{${ref(category_input).value}}"},
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

            # Query with SYNTAX ERROR (unmatched parenthesis) - in frontend format
            bad_query = "SELECT * FROM products WHERE (category = ${category_input.value}"

            with pytest.raises(SqlValidationError) as exc_info:
                validate_insight_with_inputs(
                    insight=insight,
                    query=bad_query,
                    dag=dag,
                    output_dir=tmpdir,
                    dialect="duckdb",
                )

            assert "test_insight" in str(exc_info.value)

    def test_validate_raises_if_no_inputs_in_query(self):
        """Test that validation raises error if called with query that has NO input placeholders"""
        from visivo.query.input_validator import validate_insight_with_inputs
        from visivo.models.props.insight_props import InsightProps

        with tempfile.TemporaryDirectory() as tmpdir:
            source = SourceFactory(name="test_source")
            model = SqlModelFactory(name="products", source="ref(test_source)")

            from visivo.models.project import Project

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

            query_without_inputs = "SELECT * FROM products WHERE 1=1"

            with pytest.raises(ValueError) as exc_info:
                validate_insight_with_inputs(
                    insight=insight,
                    query=query_without_inputs,
                    dag=dag,
                    output_dir=tmpdir,
                    dialect="duckdb",
                )

            error_msg = str(exc_info.value).lower()
            assert "no input" in error_msg or "programming error" in error_msg


class TestEdgeCases:
    """Test edge cases and error handling"""

    def test_inject_with_empty_values(self):
        """Test injection when values dict is empty"""
        from visivo.query.input_validator import inject_input_accessor_values

        query = "SELECT * FROM products WHERE category = ${category.value}"
        input_values = {}

        result = inject_input_accessor_values(query, input_values)

        assert "${category.value}" in result

    def test_empty_input_options_list(self):
        """Test behavior when input has no options"""
        from visivo.query.input_validator import generate_input_combinations

        inputs = {"category": []}

        combinations = generate_input_combinations(inputs)

        assert combinations == []

    def test_multiple_inputs_different_sizes(self):
        """Test combinations with inputs of different sizes"""
        from visivo.query.input_validator import generate_input_combinations

        inputs = {
            "category": ["'a'", "'b'"],
            "region": ["'x'", "'y'", "'z'"],
            "status": ["'active'"],
        }

        combinations = generate_input_combinations(inputs)

        assert len(combinations) == 6

        for combo in combinations:
            assert "category" in combo
            assert "region" in combo
            assert "status" in combo
