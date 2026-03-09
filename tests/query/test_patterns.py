"""
Tests for visivo.query.patterns module.

This module tests all the regex patterns and utility functions used for
parsing ${ref(...)} and ${name} patterns in the Visivo query system.
"""

import pytest
import re
from visivo.query.patterns import (
    REF_FUNCTION_PATTERN,
    REF_PROPERTY_PATTERN,
    PROPERTY_PATH_PATTERN,
    CONTEXT_STRING_REF_PATTERN,
    CONTEXT_STRING_REF_PATTERN_COMPILED,
    DOT_SYNTAX_NAME_PATTERN,
    get_model_name_from_match,
    extract_ref_components,
    extract_ref_names,
    replace_refs,
    has_CONTEXT_STRING_REF_PATTERN,
    validate_ref_syntax,
    count_model_references,
)


class TestREFRegex:
    """Test the REF_PROPERTY_PATTERN pattern for simple ref() and bare name validation."""

    def test_simple_ref(self):
        assert re.match(REF_PROPERTY_PATTERN, "ref(orders)")
        assert re.match(REF_PROPERTY_PATTERN, "ref(users)")
        assert re.match(REF_PROPERTY_PATTERN, "ref(model_name)")

    def test_bare_name(self):
        """Test matching bare name patterns (new dot syntax)."""
        assert re.match(REF_PROPERTY_PATTERN, "orders")
        assert re.match(REF_PROPERTY_PATTERN, "my-model")
        assert re.match(REF_PROPERTY_PATTERN, "model_name")
        assert re.match(REF_PROPERTY_PATTERN, "3d-scatter")

    def test_ref_with_spaces_in_name(self):
        assert re.match(REF_PROPERTY_PATTERN, "ref(Fibonacci Waterfall)")
        assert re.match(REF_PROPERTY_PATTERN, "ref(My Model Name)")

    def test_ref_with_quotes(self):
        assert re.match(REF_PROPERTY_PATTERN, "ref('my-model')")
        assert re.match(REF_PROPERTY_PATTERN, 'ref("my-model")')
        assert re.match(REF_PROPERTY_PATTERN, "ref('model with spaces')")

    def test_ref_with_special_chars(self):
        assert re.match(REF_PROPERTY_PATTERN, "ref(my-model)")
        assert re.match(REF_PROPERTY_PATTERN, "ref(my_model)")
        assert re.match(REF_PROPERTY_PATTERN, "ref('my-model-v2')")

    def test_ref_with_whitespace(self):
        assert re.match(REF_PROPERTY_PATTERN, "ref( orders )")
        assert re.match(REF_PROPERTY_PATTERN, "ref(  users  )")

    def test_invalid_refs(self):
        assert not re.match(REF_PROPERTY_PATTERN, "ref()")
        assert not re.match(REF_PROPERTY_PATTERN, "reference(orders)")
        assert not re.match(REF_PROPERTY_PATTERN, "ref(orders) extra")
        assert not re.match(REF_PROPERTY_PATTERN, "prefix ref(orders)")
        # "ref" alone is a valid bare name now, so it matches
        assert re.match(REF_PROPERTY_PATTERN, "ref")
        # Uppercase names don't match bare name pattern
        assert not re.match(REF_PROPERTY_PATTERN, "Orders")


class TestContextStringRefPattern:
    """Test the CONTEXT_STRING_REF_PATTERN for ${ref(...)} and ${name} patterns."""

    def test_simple_context_ref(self):
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(orders)}")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(users)}")

    def test_dot_syntax_ref(self):
        """Test matching new ${name} dot syntax."""
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${orders}")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${my-model}")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${model_name}")

    def test_dot_syntax_with_property(self):
        """Test matching ${name.property} dot syntax."""
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${orders.id}")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${my-model.field}")

    def test_does_not_match_env_vars(self):
        """Test that ${env.VAR} is NOT matched by the ref pattern."""
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${env.DB_HOST}")
        assert match is None

    def test_context_ref_with_field(self):
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(orders).id}")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(users).name}")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model).field.nested}")

    def test_context_ref_with_spaces(self):
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ ref(Fibonacci Waterfall) }")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${  ref(My Model)  }")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ ref(orders).id }")

    def test_context_ref_with_quotes(self):
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref('my-model')}")
        assert re.search(CONTEXT_STRING_REF_PATTERN, '${ref("my-model")}')
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref('my-model').field}")

    def test_context_ref_with_array_access(self):
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model)[0]}")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model).list[0]}")
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model)[0].field}")

    def test_invalid_context_refs(self):
        assert not re.search(CONTEXT_STRING_REF_PATTERN, "${ref()}")
        assert not re.search(CONTEXT_STRING_REF_PATTERN, "${reference(orders)}")
        assert not re.search(CONTEXT_STRING_REF_PATTERN, "{ref(orders)}")
        assert not re.search(CONTEXT_STRING_REF_PATTERN, "$ref(orders)")


class TestGetModelNameFromMatch:
    """Test the get_model_name_from_match helper function."""

    def test_extract_simple_name(self):
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(orders)}")
        assert get_model_name_from_match(match) == "orders"

    def test_extract_dot_syntax_name(self):
        """Test extracting name from new dot syntax."""
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${orders}")
        assert get_model_name_from_match(match) == "orders"

    def test_extract_dot_syntax_with_property(self):
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${orders.id}")
        assert get_model_name_from_match(match) == "orders"

    def test_extract_name_with_spaces(self):
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(Fibonacci Waterfall)}")
        assert get_model_name_from_match(match) == "Fibonacci Waterfall"

    def test_extract_single_quoted_name(self):
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref('my-model')}")
        assert get_model_name_from_match(match) == "my-model"

    def test_extract_double_quoted_name(self):
        match = re.search(CONTEXT_STRING_REF_PATTERN, '${ref("my-model")}')
        assert get_model_name_from_match(match) == "my-model"

    def test_extract_quoted_name_with_spaces(self):
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref('My Model Name')}")
        assert get_model_name_from_match(match) == "My Model Name"

    def test_extract_with_whitespace(self):
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref( orders )}")
        assert get_model_name_from_match(match) == "orders"

    def test_extract_from_REF_PROPERTY_PATTERN(self):
        match = re.match(REF_PROPERTY_PATTERN, "ref('my-model')")
        assert get_model_name_from_match(match) == "my-model"

    def test_extract_bare_name_from_REF_PROPERTY_PATTERN(self):
        match = re.match(REF_PROPERTY_PATTERN, "orders")
        assert get_model_name_from_match(match) == "orders"


class TestExtractRefComponents:
    """Test the extract_ref_components function."""

    def test_single_ref(self):
        result = extract_ref_components("${ref(orders)}")
        assert result == [("orders", None)]

    def test_single_dot_syntax(self):
        result = extract_ref_components("${orders}")
        assert result == [("orders", None)]

    def test_single_ref_with_property(self):
        result = extract_ref_components("${ref(orders).id}")
        assert result == [("orders", "id")]

    def test_dot_syntax_with_property(self):
        result = extract_ref_components("${orders.id}")
        assert result == [("orders", "id")]

    def test_multiple_refs(self):
        result = extract_ref_components("${ref(orders).user_id} = ${ref(users).id}")
        assert result == [("orders", "user_id"), ("users", "id")]

    def test_multiple_dot_syntax(self):
        result = extract_ref_components("${orders.user_id} = ${users.id}")
        assert result == [("orders", "user_id"), ("users", "id")]

    def test_mixed_syntax(self):
        result = extract_ref_components("${ref(orders).user_id} = ${users.id}")
        assert result == [("orders", "user_id"), ("users", "id")]

    def test_nested_property_path(self):
        result = extract_ref_components("${ref(model).field.nested}")
        assert result == [("model", "field.nested")]

    def test_array_access(self):
        result = extract_ref_components("${ref(model)[0]}")
        assert result == [("model", "[0]")]

    def test_no_refs(self):
        result = extract_ref_components("SELECT * FROM table")
        assert result == []

    def test_env_var_not_matched(self):
        result = extract_ref_components("${env.DB_HOST}")
        assert result == []


class TestExtractModelNames:
    """Test the extract_ref_names function."""

    def test_single_model(self):
        result = extract_ref_names("${ref(orders).id}")
        assert result == {"orders"}

    def test_single_model_dot_syntax(self):
        result = extract_ref_names("${orders.id}")
        assert result == {"orders"}

    def test_multiple_models(self):
        result = extract_ref_names("${ref(orders).id} = ${ref(users).id}")
        assert result == {"orders", "users"}

    def test_multiple_models_dot_syntax(self):
        result = extract_ref_names("${orders.id} = ${users.id}")
        assert result == {"orders", "users"}

    def test_duplicate_models(self):
        result = extract_ref_names("${ref(orders).id} + ${ref(orders).total}")
        assert result == {"orders"}

    def test_no_models(self):
        result = extract_ref_names("SELECT * FROM table")
        assert result == set()


class TestReplaceRefs:
    """Test the replace_refs function."""

    def test_simple_replacement(self):
        def replacer(model, field):
            if field:
                return f"{model}_cte.{field}"
            return model

        result = replace_refs("${ref(orders).id}", replacer)
        assert result == "orders_cte.id"

    def test_dot_syntax_replacement(self):
        def replacer(model, field):
            if field:
                return f"{model}_cte.{field}"
            return model

        result = replace_refs("${orders.id}", replacer)
        assert result == "orders_cte.id"

    def test_multiple_replacements(self):
        def replacer(model, field):
            return f"{model}.{field}" if field else model

        result = replace_refs("${ref(orders).id} = ${ref(users).id}", replacer)
        assert result == "orders.id = users.id"

    def test_replacement_without_field(self):
        def replacer(model, field):
            return f"table_{model}"

        result = replace_refs("SELECT * FROM ${ref(orders)}", replacer)
        assert result == "SELECT * FROM table_orders"

    def test_no_refs_to_replace(self):
        def replacer(model, field):
            return "REPLACED"

        result = replace_refs("SELECT * FROM table", replacer)
        assert result == "SELECT * FROM table"


class TestHasContextStringRefPattern:
    """Test the has_CONTEXT_STRING_REF_PATTERN function."""

    def test_has_ref_pattern(self):
        assert has_CONTEXT_STRING_REF_PATTERN("${ref(orders)}")
        assert has_CONTEXT_STRING_REF_PATTERN("text ${ref(orders).id} more text")

    def test_has_dot_syntax_pattern(self):
        assert has_CONTEXT_STRING_REF_PATTERN("${orders}")
        assert has_CONTEXT_STRING_REF_PATTERN("text ${orders.id} more text")

    def test_no_ref_pattern(self):
        assert not has_CONTEXT_STRING_REF_PATTERN("SELECT * FROM table")
        assert not has_CONTEXT_STRING_REF_PATTERN("ref(orders)")


class TestValidateRefSyntax:
    """Test the validate_ref_syntax function."""

    def test_valid_syntax(self):
        is_valid, error = validate_ref_syntax("${ref(orders)}")
        assert is_valid
        assert error is None

    def test_valid_with_field(self):
        is_valid, error = validate_ref_syntax("${ref(orders).id}")
        assert is_valid
        assert error is None

    def test_valid_dot_syntax(self):
        """Test that new dot syntax is accepted."""
        is_valid, error = validate_ref_syntax("${orders}")
        assert is_valid
        assert error is None

    def test_valid_dot_syntax_with_property(self):
        is_valid, error = validate_ref_syntax("${orders.id}")
        assert is_valid
        assert error is None

    def test_valid_env_var(self):
        is_valid, error = validate_ref_syntax("${env.DB_HOST}")
        assert is_valid
        assert error is None


class TestCountModelReferences:
    """Test the count_model_references function."""

    def test_single_model(self):
        assert count_model_references("${ref(orders).id}") == 1

    def test_single_model_dot_syntax(self):
        assert count_model_references("${orders.id}") == 1

    def test_multiple_models(self):
        assert count_model_references("${ref(orders).id} = ${ref(users).id}") == 2

    def test_duplicate_models(self):
        assert count_model_references("${ref(orders).id} + ${ref(orders).total}") == 1

    def test_no_models(self):
        assert count_model_references("SELECT * FROM table") == 0


class TestPropertyPathPattern:
    """Test that property paths are correctly captured."""

    def test_simple_field(self):
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model).field}")
        assert match.group("property_path") == ".field"

    def test_dot_syntax_field(self):
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${model.field}")
        assert match is not None
        assert match.group("property_path") == ".field"

    def test_nested_field(self):
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model).field.nested}")
        assert match.group("property_path") == ".field.nested"

    def test_array_index(self):
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model)[0]}")
        assert match.group("property_path") == "[0]"

    def test_complex_path(self):
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model).list[0].property}")
        assert match.group("property_path") == ".list[0].property"

    def test_empty_path(self):
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model)}")
        assert match.group("property_path") == ""

    def test_empty_path_dot_syntax(self):
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${model}")
        assert match is not None
        assert match.group("property_path") == ""


class TestEdgeCases:
    """Test edge cases and boundary conditions."""

    def test_model_name_with_all_special_chars(self):
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(my-model_v2)}")
        assert get_model_name_from_match(match) == "my-model_v2"

    def test_very_long_model_name(self):
        long_name = "a" * 100
        pattern = f"${{ref({long_name})}}"
        match = re.search(CONTEXT_STRING_REF_PATTERN, pattern)
        assert get_model_name_from_match(match) == long_name

    def test_model_name_with_numbers(self):
        match = re.search(CONTEXT_STRING_REF_PATTERN, "${ref(model123)}")
        assert get_model_name_from_match(match) == "model123"

    def test_mixed_quotes_in_text(self):
        text = "${ref('model1')} and ${ref(\"model2\")}"
        result = extract_ref_names(text)
        assert result == {"model1", "model2"}

    def test_ref_at_start_of_string(self):
        assert re.search(CONTEXT_STRING_REF_PATTERN, "${ref(orders)} WHERE id = 1")

    def test_ref_at_end_of_string(self):
        assert re.search(CONTEXT_STRING_REF_PATTERN, "SELECT * FROM ${ref(orders)}")

    def test_multiple_refs_adjacent(self):
        result = extract_ref_components("${ref(a)}${ref(b)}")
        assert result == [("a", None), ("b", None)]

    def test_env_var_excluded_from_dot_syntax(self):
        """Ensure ${env.VAR} is not treated as a dot syntax ref."""
        result = extract_ref_components("${env.DB_HOST}")
        assert result == []

    def test_mixed_legacy_and_dot_syntax(self):
        result = extract_ref_components("${ref(orders).id} = ${users.id}")
        assert result == [("orders", "id"), ("users", "id")]
