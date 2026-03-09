"""
Shared patterns and utilities for parsing context strings and references.

This module provides a single source of truth for regex patterns used throughout
the query resolution system, eliminating duplication and ensuring consistency.
"""

import re
from typing import Tuple, Optional, List, Set


# ============================================================================
# Base Patterns - Character classes and building blocks
# ============================================================================

# Valid characters in reference names (allows alphanumeric, spaces, quotes, hyphens, underscores)
NAME_REGEX = r"a-zA-Z0-9\s'\"\-_"

# ============================================================================
# Name Validation - For new naming conventions
# ============================================================================

# Compiled pattern for checking if a name is valid
# Valid names: lowercase, alphanumeric, underscore, and hyphen only
# Can start with letter, underscore, or digit
VALID_NAME_PATTERN = re.compile(r"^[a-z0-9_][a-z0-9_-]*$")


def is_valid_name(name: str) -> bool:
    """
    Check if a name is valid for the new naming conventions.

    Valid names must:
    - Be lowercase
    - Start with a letter, digit, or underscore
    - Contain only alphanumeric characters, underscores, and hyphens

    Args:
        name: The name to check

    Returns:
        True if the name is valid
    """
    return bool(VALID_NAME_PATTERN.match(name))


def normalize_name(name: str) -> str:
    """
    Normalize a name to be valid for the new naming conventions.

    Transformation rules:
    - Insert underscore before uppercase letters (for camelCase/PascalCase)
    - Lowercase the entire string
    - Replace any character that isn't alphanumeric, underscore, or hyphen with hyphen
    - Collapse multiple consecutive hyphens into one
    - Strip leading and trailing hyphens

    Args:
        name: The name to normalize

    Returns:
        A valid name

    Examples:
        >>> normalize_name("My Model")
        "my-model"
        >>> normalize_name("MyModel")
        "my_model"
        >>> normalize_name("Orders (2024)")
        "orders-2024"
        >>> normalize_name("user.name")
        "user-name"
        >>> normalize_name("3D Scatter")
        "3d-scatter"
    """
    # Insert underscore before uppercase letters (for camelCase/PascalCase)
    result = re.sub(r"([a-z])([A-Z])", r"\1_\2", name)

    # Lowercase
    result = result.lower()

    # Replace invalid characters with hyphen
    result = re.sub(r"[^a-z0-9_-]", "-", result)

    # Collapse multiple consecutive hyphens into one
    result = re.sub(r"-+", "-", result)

    # Strip leading and trailing hyphens
    result = result.strip("-")

    return result


# ============================================================================
# Reference Patterns - ${ref(...)} and ${name} syntax variations
# ============================================================================

# Ref function pattern: ref(model) or ref('model') or ref("model")
# Captures: model_name (may include surrounding quotes which are stripped by helper function)
# Example: ref(orders) or ref('my-model') or ref(Fibonacci Waterfall)
# This pattern is used both standalone and as part of CONTEXT_STRING_REF_PATTERN
REF_FUNCTION_PATTERN = rf"ref\(\s*(?P<model_name>[{NAME_REGEX}]+)\s*\)"

# Dot syntax name pattern: lowercase alphanumeric with underscores and hyphens, no dots
DOT_SYNTAX_NAME_PATTERN = r"[a-z0-9_][a-z0-9_-]*"

# Simple ref pattern: ref(name) OR bare name (new dot syntax)
# Used for validation in Pydantic models
# Matches: ref(orders) OR orders OR my-model
REF_PROPERTY_PATTERN = rf"^(?:{REF_FUNCTION_PATTERN}|(?P<bare_name>{DOT_SYNTAX_NAME_PATTERN}))$"

# Property path pattern: optional dots, brackets, digits, word chars
# Captures: property_path (the property path after ref())
# Examples: .id, [0], .list[0].property, or empty string
PROPERTY_PATH_PATTERN = r"(?P<property_path>[\.\d\w\[\]]*?)"

# Legacy pattern for ${ref(model).field} or ${ref('model').field} or ${ref('model')[0]}
LEGACY_CONTEXT_STRING_REF_PATTERN = rf"\${{\s*{REF_FUNCTION_PATTERN}{PROPERTY_PATH_PATTERN}\s*}}"

# New dot syntax pattern for ${name} or ${name.property}
# Excludes env. prefix (reserved for environment variables)
DOT_SYNTAX_REF_PATTERN = (
    rf"\${{\s*(?!env\.)(?P<dot_model_name>{DOT_SYNTAX_NAME_PATTERN}){PROPERTY_PATH_PATTERN}\s*}}"
)

# Combined pattern: matches EITHER ${ref(name).prop} (legacy) OR ${name.prop} (new dot syntax)
# Uses named groups: model_name (from ref() syntax) or dot_model_name (from dot syntax)
# property_path is shared between both
# Excludes env. and project prefixes (reserved for environment variables and inline path access)
CONTEXT_STRING_REF_PATTERN = rf"\${{\s*(?:ref\(\s*(?P<model_name>[{NAME_REGEX}]+)\s*\)|(?!env[\.\s}}])(?!project[\.\[\s}}])(?P<dot_model_name>{DOT_SYNTAX_NAME_PATTERN}))(?P<property_path>[\.\d\w\[\]]*?)\s*}}"

# Legacy field ref pattern (still matches old syntax)
FIELD_REF_PATTERN = (
    r"\$\{\s*(?:ref\(([^)]+)\)|(?!env\.)([a-z0-9_][a-z0-9_-]*))(?:\.([^}\s]+))?\s*\}"
)


# ============================================================================
# Context String Patterns - ${ } general syntax
# ============================================================================

# Environment variable pattern: ${env.VAR_NAME}
# Captures: variable name (alphanumeric and underscore, must start with letter or underscore)
# Example: ${env.DB_PASSWORD} or ${ env.API_KEY }
ENV_VAR_CONTEXT_PATTERN = r"\$\{\s*env\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}"

# Inline path pattern: ${path.to.property}
# Example: ${user.name} or ${data[0].value}
INLINE_PATH_REGEX = rf"\${{\s*([{NAME_REGEX}\.\[\]]+?)\s*}}"

# General context string value pattern: ${anything}
# Used for equality and hashing in ContextString class
CONTEXT_STRING_VALUE_PATTERN = rf"\${{\s*([{NAME_REGEX}\.\[\]\)\()]+?)\s*}}"


# ============================================================================
# Query and Column Patterns
# ============================================================================

# Query string pattern: ?{expression}
# Used for inline query expressions in props
# Example: ?{sum(amount)}
QUERY_STRING_VALUE_PATTERN = r"^\?\{\s*(?P<query_string>.+)\s*\}\s*$"

# Query function pattern: query(SELECT ...)
QUERY_REGEX = r"^\s*query\(\s*(?P<query_statement>.+)\)\s*$"

# Column function pattern: column(name) or column(name)[slice]
COLUMN_REGEX = (
    r"^\s*column\(\s*(?P<column_name>.+)\)(?:\[(?:-?\d*:-?\d+|-?\d+:-?\d*|:-?\d+|-?\d+:)\])?\s*$"
)

# Combined statement pattern
STATEMENT_REGEX = rf"{QUERY_REGEX}|{COLUMN_REGEX}|{CONTEXT_STRING_VALUE_PATTERN}"

# Indexed column pattern: column(name)[index]
INDEXED_STATEMENT_REGEX = r"^\s*column\(\s*(?P<column_name>.+)\)\[(-?\d*)\]\s*$"


# ============================================================================
# Compiled Patterns - For performance
# ============================================================================

CONTEXT_STRING_REF_PATTERN_COMPILED = re.compile(CONTEXT_STRING_REF_PATTERN)


def get_model_name_from_match(match: re.Match) -> str:
    """
    Extract model_name from a match object, stripping quotes if present.

    Handles both legacy ref() syntax (model_name group) and new dot syntax (dot_model_name group).

    Args:
        match: A regex match object from CONTEXT_STRING_REF_PATTERN or REF_FUNCTION_PATTERN

    Returns:
        The model name with surrounding quotes stripped
    """
    # Try legacy ref() group first
    model_name = None
    try:
        model_name = match.group("model_name")
    except IndexError:
        pass

    if model_name:
        model_name = model_name.strip()
        if (model_name.startswith("'") and model_name.endswith("'")) or (
            model_name.startswith('"') and model_name.endswith('"')
        ):
            model_name = model_name[1:-1]
        return model_name

    # Try new dot syntax group
    try:
        dot_name = match.group("dot_model_name")
        if dot_name:
            return dot_name.strip()
    except IndexError:
        pass

    # Try bare_name group (from REF_PROPERTY_PATTERN)
    try:
        bare_name = match.group("bare_name")
        if bare_name:
            return bare_name.strip()
    except IndexError:
        pass

    raise ValueError(f"Could not extract model name from match: {match.group(0)}")


def extract_ref_components(text: str) -> List[Tuple[str, Optional[str]]]:
    """
    Extract all ref() components from a text string.

    Args:
        text: Text containing ${ref(model).field} patterns

    Returns:
        List of tuples (model_name, field_name) where field_name may be None

    Examples:
        >>> extract_ref_components("${ref(orders).user_id} = ${ref(users).id}")
        [('orders', 'user_id'), ('users', 'id')]
    """
    results = []
    for match in CONTEXT_STRING_REF_PATTERN_COMPILED.finditer(text):
        model_name = get_model_name_from_match(match)
        property_path_raw = (
            match.group("property_path").strip() if match.group("property_path") else None
        )
        # Strip leading dot from property_path if present (e.g., ".id" -> "id")
        property_path = (
            property_path_raw.lstrip(".")
            if property_path_raw and property_path_raw.startswith(".")
            else property_path_raw
        )
        # Convert empty string to None
        property_path = property_path if property_path else None
        results.append((model_name, property_path))
    return results


def extract_ref_names(text: str) -> Set[str]:
    """
    Extract unique model names from ref() patterns in text.

    Args:
        text: Text containing ${ref(model)} patterns

    Returns:
        Set of unique model names

    Example:
        >>> extract_ref_names("${ref(orders).id} = ${ref(users).id}")
        {'orders', 'users'}
    """
    return {model for model, _ in extract_ref_components(text)}


def replace_refs(text: str, replacer_func) -> str:
    """
    Replace ref() patterns in text using a custom replacer function.

    Args:
        text: Text containing ${ref(model).field} patterns
        replacer_func: Function that takes (model_name, field_name) and returns replacement string

    Returns:
        Text with all ref() patterns replaced

    Example:
        >>> replace_refs("${ref(orders).id}", lambda m, f: f"{m}_cte.{f}" if f else m)
        "orders_cte.id"
    """

    def replace_match(match):
        model_name = get_model_name_from_match(match)
        property_path_raw = (
            match.group("property_path").strip() if match.group("property_path") else None
        )
        # Strip leading dot from property_path if present (e.g., ".id" -> "id")
        property_path = (
            property_path_raw.lstrip(".")
            if property_path_raw and property_path_raw.startswith(".")
            else property_path_raw
        )
        # Convert empty string to None
        property_path = property_path if property_path else None
        return replacer_func(model_name, property_path)

    return CONTEXT_STRING_REF_PATTERN_COMPILED.sub(replace_match, text)


def has_CONTEXT_STRING_REF_PATTERN(text: str) -> bool:
    """
    Check if text contains any ref() patterns.

    Args:
        text: Text to check

    Returns:
        True if text contains ${ref(...)} patterns
    """
    return bool(CONTEXT_STRING_REF_PATTERN_COMPILED.search(text))


def validate_ref_syntax(text: str) -> Tuple[bool, Optional[str]]:
    """
    Validate that all ${ } patterns in text contain valid ref(), env., or dot syntax references.

    Accepts:
        - ${ref(name)} or ${ref(name).prop} (legacy)
        - ${env.VAR_NAME} (environment variables)
        - ${name} or ${name.prop} (new dot syntax, where name matches DOT_SYNTAX_NAME_PATTERN)

    Args:
        text: Text to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    # Find all ${ } patterns
    dollar_pattern = r"\$\{([^}]*)\}"
    dot_syntax_compiled = re.compile(rf"^\s*{DOT_SYNTAX_NAME_PATTERN}[\.\d\w\[\]]*\s*$")

    for match in re.finditer(dollar_pattern, text):
        content = match.group(0)
        inner = match.group(1)
        # Check if it contains ref() or env.
        if "ref(" in content or "env." in content:
            continue
        # Check if it matches new dot syntax (e.g., ${orders} or ${orders.id})
        if dot_syntax_compiled.match(inner):
            continue
        return False, f"Invalid context string: {content} - missing ref() or env. syntax"

    return True, None


def count_model_references(text: str) -> int:
    """
    Count the number of unique models referenced in text.

    Args:
        text: Text containing ${ref(model)} patterns

    Returns:
        Number of unique models referenced
    """
    return len(extract_ref_names(text))


# ============================================================================
# Input Accessor Patterns - ${ref(input_name).accessor} syntax
# ============================================================================

# Input accessor pattern: ${ref(input_name).accessor} OR ${input_name.accessor}
# Used for referencing input values in insight filters
# Captures: (1) input_name, (2) accessor
# Examples:
#   ${ref(region).value} or ${region.value} - single-select value
#   ${ref(categories).values} or ${categories.values} - multi-select values array
#   ${ref(price_range).min} or ${price_range.min} - minimum of selected values
INPUT_ACCESSOR_PATTERN = r"\$\{(?:ref\((\w+)\)|(?!env\.)(\w+))\.(\w+)\}"
INPUT_ACCESSOR_PATTERN_COMPILED = re.compile(INPUT_ACCESSOR_PATTERN)

# Pattern for frontend/post_query format (simplified, without ref() wrapper):
#   ${region.value} - value of single-select input
#   ${categories.values} - multi-select values array
#   ${price_range.min} - minimum of selected values
# This format is used in post_query for frontend JS template literal injection
INPUT_FRONTEND_PATTERN = r"\$\{(\w+)\.(\w+)\}"
INPUT_FRONTEND_PATTERN_COMPILED = re.compile(INPUT_FRONTEND_PATTERN)

# Valid accessors for single-select inputs
SINGLE_SELECT_ACCESSORS = {"value"}

# Valid accessors for multi-select inputs
MULTI_SELECT_ACCESSORS = {"values", "min", "max", "first", "last"}

# All valid input accessors
ALL_INPUT_ACCESSORS = SINGLE_SELECT_ACCESSORS | MULTI_SELECT_ACCESSORS


def extract_input_accessors(text: str) -> List[Tuple[str, str]]:
    """
    Extract all input accessor references from a text string.

    Supports both ${ref(input_name).accessor} and ${input_name.accessor} syntax.

    Args:
        text: Text containing input accessor patterns

    Returns:
        List of tuples (input_name, accessor)

    Examples:
        >>> extract_input_accessors("region = ${ref(region).value}")
        [('region', 'value')]
        >>> extract_input_accessors("region = ${region.value}")
        [('region', 'value')]
    """
    results = []
    for match in INPUT_ACCESSOR_PATTERN_COMPILED.finditer(text):
        # Group 1 is ref() name, group 2 is dot syntax name, group 3 is accessor
        input_name = match.group(1) or match.group(2)
        accessor = match.group(3)
        results.append((input_name, accessor))
    return results


def extract_frontend_input_accessors(text: str) -> List[Tuple[str, str]]:
    """
    Extract all input accessor references from frontend/post_query format.

    Args:
        text: Text containing ${input_name.accessor} patterns (without ref wrapper)

    Returns:
        List of tuples (input_name, accessor)

    Examples:
        >>> extract_frontend_input_accessors("region = ${region.value}")
        [('region', 'value')]
        >>> extract_frontend_input_accessors("price BETWEEN ${price_range.min} AND ${price_range.max}")
        [('price_range', 'min'), ('price_range', 'max')]
    """
    return INPUT_FRONTEND_PATTERN_COMPILED.findall(text)


def extract_input_names_from_accessors(text: str) -> Set[str]:
    """
    Extract unique input names from accessor patterns in text.

    Args:
        text: Text containing ${ref(input_name).accessor} patterns

    Returns:
        Set of unique input names

    Example:
        >>> extract_input_names_from_accessors("${ref(region).value} AND ${ref(price).min}")
        {'region', 'price'}
    """
    return {input_name for input_name, _ in extract_input_accessors(text)}


def has_input_accessor_pattern(text: str) -> bool:
    """
    Check if text contains any input accessor patterns.

    Args:
        text: Text to check

    Returns:
        True if text contains ${ref(input_name).accessor} patterns
    """
    return bool(INPUT_ACCESSOR_PATTERN_COMPILED.search(text))


def replace_input_accessors(text: str, replacer_func) -> str:
    """
    Replace input accessor patterns in text using a custom replacer function.

    Supports both ${ref(input_name).accessor} and ${input_name.accessor} syntax.

    Args:
        text: Text containing input accessor patterns
        replacer_func: Function that takes (input_name, accessor) and returns replacement string

    Returns:
        Text with all input accessor patterns replaced
    """

    def replace_match(match):
        input_name = match.group(1) or match.group(2)
        accessor = match.group(3)
        return replacer_func(input_name, accessor)

    return INPUT_ACCESSOR_PATTERN_COMPILED.sub(replace_match, text)
