"""
Tests for visivo.query.patterns module.

This module tests all the regex patterns and utility functions used for
parsing ${ref(...)} patterns in the Visivo query system.
"""

import pytest
import re
from visivo.query.patterns import (
    REF_FUNCTION_PATTERN,
    REF_PROPERTY_PATTERN,
    PROPERTY_PATH_PATTERN,
    CONTEXT_STRING_REF_PATTERN,
    CONTEXT_STRING_REF_PATTERN_COMPILED,
    get_model_name_from_match,
    extract_ref_components,
    extract_ref_names,
    replace_refs,
    has_CONTEXT_STRING_REF_PATTERN,
    validate_ref_syntax,
    count_model_references,
)


class TestREFRegex:
    """Test the REF_PROPERTY_PATTERN pattern for simple ref() validation."""

    def test_simple_ref(self):
        """Test matching simple unquoted ref patterns."""
        assert re.match(REF_PROPERTY_PATTERN, "ref(orders)")
        assert re.match(REF_PROPERTY_PATTERN, "ref(users)")
        assert re.match(REF_PROPERTY_PATTERN, "ref(model_name)")

    def test_ref_with_spaces_in_name(self):
        """Test matching ref patterns with spaces in model names."""
        assert re.match(REF_PROPERTY_PATTERN, "ref(Fibonacci Waterfall)")
        assert re.match(REF_PROPERTY_PATTERN, "ref(My Model Name)")

    def test_ref_with_quotes(self):
        """Test matching ref patterns with quoted model names."""
        assert re.match(REF_PROPERTY_PATTERN, "ref('my-model')")
        assert re.match(REF_PROPERTY_PATTERN, 'ref("my-model")')
        assert re.match(REF_PROPERTY_PATTERN, "ref('model with spaces')")

    def test_ref_with_special_chars(self):
        """Test matching ref patterns with hyphens and underscores."""
        assert re.match(REF_PROPERTY_PATTERN, "ref(my-model)")
        assert re.match(REF_PROPERTY_PATTERN, "ref(my_model)")
        assert re.match(REF_PROPERTY_PATTERN, "ref('my-model-v2')")

    def test_ref_with_whitespace(self):
        """Test matching ref patterns with whitespace padding."""
        assert re.match(REF_PROPERTY_PATTERN, "ref( orders )")
        assert re.match(REF_PROPERTY_PATTERN, "ref(  users  )")

    def test_invalid_refs(self):
        """Test that invalid patterns don't match."""
        assert not re.match(REF_PROPERTY_PATTERN, "ref()")
        assert not re.match(REF_PROPERTY_PATTERN, "ref")
        assert not re.match(REF_PROPERTY_PATTERN, "reference(orders)")
        assert not re.match(REF_PROPERTY_PATTERN, "ref(orders) extra")
        assert not re.match(REF_PROPERTY_PATTERN, "prefix ref(orders)")


class TestContextStringRefPattern:
    """Test the CONTEXT_STRING_REF_PATTERN for ${ref(...)} patterns."""

    def test_simple_context_ref(self):
        """Test matching simple ${ref(...)} patterns."""
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(orders)}")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(users)}")

    def test_context_ref_with_field(self):
        """Test matching ${ref(...).field} patterns."""
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(orders).id}")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(users).name}")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model).field.nested}")

    def test_context_ref_with_spaces(self):
        """Test matching patterns with spaces in model names and around ref."""
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ ref(Fibonacci Waterfall) }")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${  ref(My Model)  }")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ ref(orders).id }")

    def test_context_ref_with_quotes(self):
        """Test matching patterns with quoted model names."""
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref('my-model')}")
        assert re.search(CONTEXT_STRING_REF_PATTERN, '${ref("my-model")}')
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref('my-model').field}")

    def test_context_ref_with_array_access(self):
        """Test matching patterns with array/bracket notation."""
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model)[0]}")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model).list[0]}")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model)[0].field}")

    def test_invalid_context_refs(self):
        """Test that invalid patterns don't match."""
        assert not re.search(CONTEXT_STRING_REF_PATTERN, "${ref()}")
        assert not re.search(CONTEXT_STRING_REF_PATTERN, "${reference(orders)}")
        assert not re.search(CONTEXT_STRING_REF_PATTERN, "{ref(orders)}")  # Missing $
        assert not re.search(CONTEXT_STRING_REF_PATTERN, "$ref(orders)")  # Missing braces


class TestGetModelNameFromMatch:
    """Test the get_model_name_from_match helper function."""

    def test_extract_simple_name(self):
        """Test extracting simple unquoted model names."""
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(orders)}")
        assert get_model_name_from_match(match) == "orders"

    def test_extract_name_with_spaces(self):
        """Test extracting model names with spaces."""
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(Fibonacci Waterfall)}")
        assert get_model_name_from_match(match) == "Fibonacci Waterfall"

    def test_extract_single_quoted_name(self):
        """Test extracting single-quoted model names with quotes stripped."""
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref('my-model')}")
        assert get_model_name_from_match(match) == "my-model"

    def test_extract_double_quoted_name(self):
        """Test extracting double-quoted model names with quotes stripped."""
        match = re.search(CONTEXT_STRING_REF_PATTERN, '${ref("my-model")}')
        assert get_model_name_from_match(match) == "my-model"

    def test_extract_quoted_name_with_spaces(self):
        """Test extracting quoted model names containing spaces."""
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref('My Model Name')}")
        assert get_model_name_from_match(match) == "My Model Name"

    def test_extract_with_whitespace(self):
        """Test that whitespace around names is stripped."""
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref( orders )}")
        assert get_model_name_from_match(match) == "orders"

    def test_extract_from_REF_PROPERTY_PATTERN(self):
        """Test extracting from REF_PROPERTY_PATTERN matches."""
        match = re.match(REF_PROPERTY_PATTERN, "ref('my-model')")
        assert get_model_name_from_match(match) == "my-model"


class TestExtractRefComponents:
    """Test the extract_ref_components function."""

    def test_single_ref(self):
        """Test extracting a single ref without property path."""
        result = extract_ref_components("${ref(orders)}")
        assert result == [("orders", None)]

    def test_single_ref_with_property(self):
        """Test extracting a single ref with property path."""
        result = extract_ref_components("${ref(orders).id}")
        assert result == [("orders", "id")]

    def test_multiple_refs(self):
        """Test extracting multiple refs from text."""
        result = extract_ref_components("${ref(orders).user_id} = ${ref(users).id}")
        assert result == [("orders", "user_id"), ("users", "id")]

    def test_nested_property_path(self):
        """Test extracting nested property paths."""
        result = extract_ref_components("${ref(model).field.nested}")
        assert result == [("model", "field.nested")]

    def test_array_access(self):
        """Test extracting array access patterns."""
        result = extract_ref_components("${ref(model)[0]}")
        assert result == [("model", "[0]")]

    def test_no_refs(self):
        """Test extracting from text with no refs."""
        result = extract_ref_components("SELECT * FROM table")
        assert result == []


class TestExtractModelNames:
    """Test the extract_ref_names function."""

    def test_single_model(self):
        """Test extracting a single model name."""
        result = extract_ref_names("${ref(orders).id}")
        assert result == {"orders"}

    def test_multiple_models(self):
        """Test extracting multiple unique model names."""
        result = extract_ref_names("${ref(orders).id} = ${ref(users).id}")
        assert result == {"orders", "users"}

    def test_duplicate_models(self):
        """Test that duplicate model names are deduplicated."""
        result = extract_ref_names("${ref(orders).id} + ${ref(orders).total}")
        assert result == {"orders"}

    def test_no_models(self):
        """Test extracting from text with no refs."""
        result = extract_ref_names("SELECT * FROM table")
        assert result == set()


class TestReplaceRefs:
    """Test the replace_refs function."""

    def test_simple_replacement(self):
        """Test simple ref replacement."""

        def replacer(model, field):
            if field:
                return f"{model}_cte.{field}"
            return model

        result = replace_refs("${ref(orders).id}", replacer)
        assert result == "orders_cte.id"

    def test_multiple_replacements(self):
        """Test replacing multiple refs."""

        def replacer(model, field):
            return f"{model}.{field}" if field else model

        result = replace_refs("${ref(orders).id} = ${ref(users).id}", replacer)
        assert result == "orders.id = users.id"

    def test_replacement_without_field(self):
        """Test replacing refs without property paths."""

        def replacer(model, field):
            return f"table_{model}"

        result = replace_refs("SELECT * FROM ${ref(orders)}", replacer)
        assert result == "SELECT * FROM table_orders"

    def test_no_refs_to_replace(self):
        """Test that text without refs is unchanged."""

        def replacer(model, field):
            return "REPLACED"

        result = replace_refs("SELECT * FROM table", replacer)
        assert result == "SELECT * FROM table"


class TestHasContextStringRefPattern:
    """Test the has_CONTEXT_STRING_REF_PATTERN function."""

    def test_has_ref_pattern(self):
        """Test detecting ref patterns."""
        assert has_CONTEXT_STRING_REF_PATTERN("${ref(orders)}")
        assert has_CONTEXT_STRING_REF_PATTERN("text ${ref(orders).id} more text")

    def test_no_ref_pattern(self):
        """Test not detecting when no refs present."""
        assert not has_CONTEXT_STRING_REF_PATTERN("SELECT * FROM table")
        assert not has_CONTEXT_STRING_REF_PATTERN("ref(orders)")  # Missing ${}


class TestValidateRefSyntax:
    """Test the validate_ref_syntax function."""

    def test_valid_syntax(self):
        """Test validating correct ref syntax."""
        is_valid, error = validate_ref_syntax("${ref(orders)}")
        assert is_valid
        assert error is None

    def test_valid_with_field(self):
        """Test validating correct ref syntax with field."""
        is_valid, error = validate_ref_syntax("${ref(orders).id}")
        assert is_valid
        assert error is None

    def test_invalid_missing_ref(self):
        """Test validating incorrect syntax missing ref function."""
        is_valid, error = validate_ref_syntax("${orders}")
        assert not is_valid
        assert "missing ref() or env." in error


class TestCountModelReferences:
    """Test the count_model_references function."""

    def test_single_model(self):
        """Test counting a single model."""
        assert count_model_references("${ref(orders).id}") == 1

    def test_multiple_models(self):
        """Test counting multiple unique models."""
        assert count_model_references("${ref(orders).id} = ${ref(users).id}") == 2

    def test_duplicate_models(self):
        """Test that duplicates are not double-counted."""
        assert count_model_references("${ref(orders).id} + ${ref(orders).total}") == 1

    def test_no_models(self):
        """Test counting when no models present."""
        assert count_model_references("SELECT * FROM table") == 0


class TestPropertyPathPattern:
    """Test that property paths are correctly captured."""

    def test_simple_field(self):
        """Test capturing simple field names."""
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model).field}")
        assert match.group("property_path") == ".field"

    def test_nested_field(self):
        """Test capturing nested field paths."""
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model).field.nested}")
        assert match.group("property_path") == ".field.nested"

    def test_array_index(self):
        """Test capturing array indices."""
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model)[0]}")
        assert match.group("property_path") == "[0]"

    def test_complex_path(self):
        """Test capturing complex property paths."""
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model).list[0].property}")
        assert match.group("property_path") == ".list[0].property"

    def test_empty_path(self):
        """Test that refs without property paths have empty string."""
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model)}")
        assert match.group("property_path") == ""


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_model_name_with_all_special_chars(self):
        """Test model names using all allowed special characters."""
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(my-model_v2)}")
        assert get_model_name_from_match(match) == "my-model_v2"

    def test_very_long_model_name(self):
        """Test very long model names."""
        long_name = "a" * 100
        pattern = f"${{ref({long_name})}}"
        match = re.search(CONTEXT_STRING_REF_PATTERN, pattern)
        assert get_model_name_from_match(match) == long_name

    def test_model_name_with_numbers(self):
        """Test model names with numbers."""
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model123)}")
        assert get_model_name_from_match(match) == "model123"

    def test_mixed_quotes_in_text(self):
        """Test handling mixed quote styles in same text."""
        text = "${ref('model1')} and ${ref(\"model2\")}"
        result = extract_ref_names(text)
        assert result == {"model1", "model2"}

    def test_ref_at_start_of_string(self):
        """Test ref pattern at the very start."""
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(orders)} WHERE id = 1")

    def test_ref_at_end_of_string(self):
        """Test ref pattern at the very end."""
        assert re.search(CONTEXT_STRING_REF_PATTERN, "SELECT * FROM ${ref(orders)}")

    def test_multiple_refs_adjacent(self):
        """Test multiple refs right next to each other."""
        result = extract_ref_components("${ref(a)}${ref(b)}")
        assert result == [("a", None), ("b", None)]
