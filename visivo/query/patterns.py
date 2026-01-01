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
# Reference Patterns - ${ref(...)} syntax variations
# ============================================================================

# Ref function pattern: ref(model) or ref('model') or ref("model")
# Captures: model_name (may include surrounding quotes which are stripped by helper function)
# Example: ref(orders) or ref('my-model') or ref(Fibonacci Waterfall)
# This pattern is used both standalone and as part of CONTEXT_STRING_REF_PATTERN
REF_FUNCTION_PATTERN = rf"ref\(\s*(?P<model_name>[{NAME_REGEX}]+)\s*\)"

# Simple ref pattern: ref(name) without ${ }
# Used for validation in Pydantic models - just an alias to REF_FUNCTION_PATTERN with anchors
# Example: ref(orders)
REF_PROPERTY_PATTERN = rf"^{REF_FUNCTION_PATTERN}$"

# Property path pattern: optional dots, brackets, digits, word chars
# Captures: property_path (the property path after ref())
# Examples: .id, [0], .list[0].property, or empty string
PROPERTY_PATH_PATTERN = r"(?P<property_path>[\.\d\w\[\]]*?)"

# Core pattern for ${ref(model).field} or ${ref('model').field} or ${ref('model')[0]}
# Composed of: ${ + REF_FUNCTION + PROPERTY_PATH + }
# Captures: model_name (with quotes stripped), property_path (optional, without leading dot/bracket)
# This is the most flexible pattern used in query resolution
# The model_name capture handles both quoted 'model' and unquoted model
# property_path captures property paths like "nested.property" or "[0]" or "list[0].property"
# property_path is optional - will be None if not present
# DEPRECATED: Use REFS_CONTEXT_PATTERN instead
CONTEXT_STRING_REF_PATTERN = rf"\${{\s*{REF_FUNCTION_PATTERN}{PROPERTY_PATH_PATTERN}\s*}}"
FIELD_REF_PATTERN = r"\$\{\s*ref\(([^)]+)\)(?:\.([^}]+))?\s*\}"


# ============================================================================
# New Refs Syntax - ${refs.name.property} (consistent with ${env.VAR})
# ============================================================================

# Valid name pattern for refs: alphanumeric, underscore, and hyphen only
# Must start with letter or underscore, must be lowercase
# Examples: orders, my_model, my-model
REFS_NAME_PATTERN = r"[a-zA-Z_][a-zA-Z0-9_-]*"

# Compiled pattern for checking if a name is valid for the new refs syntax
# Valid names: lowercase, alphanumeric, underscore, and hyphen only
# Must start with letter or underscore
VALID_NAME_PATTERN = re.compile(r"^[a-z_][a-z0-9_-]*$")


def is_valid_name(name: str) -> bool:
    """
    Check if a name is valid for the new refs syntax.

    Valid names must:
    - Be lowercase
    - Start with a letter or underscore
    - Contain only alphanumeric characters, underscores, and hyphens

    Args:
        name: The name to check

    Returns:
        True if the name is valid
    """
    return bool(VALID_NAME_PATTERN.match(name))


def normalize_name(name: str) -> str:
    """
    Normalize a name to be valid for the new refs syntax.

    Transformation rules:
    - Insert underscore before uppercase letters (for camelCase/PascalCase)
    - Lowercase the entire string
    - Replace any character that isn't alphanumeric, underscore, or hyphen with hyphen
    - Collapse multiple consecutive hyphens into one
    - Strip leading and trailing hyphens
    - If starts with a digit, prefix with underscore

    Args:
        name: The name to normalize

    Returns:
        A valid name for the new refs syntax

    Examples:
        >>> normalize_name("My Model")
        "my-model"
        >>> normalize_name("MyModel")
        "my_model"
        >>> normalize_name("Orders (2024)")
        "orders-2024"
        >>> normalize_name("user.name")
        "user-name"
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

    # If starts with digit, prefix with underscore
    if result and result[0].isdigit():
        result = "_" + result

    return result


# Property path after name (optional): .property, [0], .nested.path
# Examples: .id, .data[0].value, [0]
REFS_PROPERTY_PATH_PATTERN = r"(?:(?:\.[a-zA-Z_][a-zA-Z0-9_-]*|\[\d+\])+)?"

# Full refs context pattern: ${refs.name} or ${refs.name.property}
# Captures: refs_name (group 1), refs_property (group 2, optional)
# Examples: ${refs.orders}, ${refs.orders.id}, ${refs.my-model.data[0]}
REFS_CONTEXT_PATTERN = rf"\${{\s*refs\.(?P<refs_name>{REFS_NAME_PATTERN})(?P<refs_property>{REFS_PROPERTY_PATH_PATTERN})\s*}}"
REFS_CONTEXT_PATTERN_COMPILED = re.compile(REFS_CONTEXT_PATTERN)


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

    Args:
        match: A regex match object from CONTEXT_STRING_REF_PATTERN or REF_FUNCTION_PATTERN

    Returns:
        The model name with surrounding quotes stripped

    Examples:
        >>> # For match of ref('my-model')
        >>> get_model_name_from_match(match)
        'my-model'

        >>> # For match of ref(orders)
        >>> get_model_name_from_match(match)
        'orders'
    """
    model_name = match.group("model_name").strip()
    # Strip surrounding quotes (both single and double)
    if (model_name.startswith("'") and model_name.endswith("'")) or (
        model_name.startswith('"') and model_name.endswith('"')
    ):
        model_name = model_name[1:-1]
    return model_name


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
    Extract unique model names from both ref() and refs. patterns in text.

    Supports both syntaxes:
    - Legacy: ${ref(model)} or ${ref(model).property}
    - New: ${refs.model} or ${refs.model.property}

    Args:
        text: Text containing ${ref(model)} or ${refs.model} patterns

    Returns:
        Set of unique model names

    Example:
        >>> extract_ref_names("${ref(orders).id} = ${refs.users.id}")
        {'orders', 'users'}
    """
    # Get names from legacy ref() syntax
    legacy_names = {model for model, _ in extract_ref_components(text)}
    # Get names from new refs. syntax
    new_names = extract_refs_names(text)
    # Return combined set
    return legacy_names | new_names


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
    Validate that all ${ } patterns in text contain valid ref() or refs. calls.

    Accepts both:
    - Legacy syntax: ${ref(name)} or ${ref(name).property}
    - New syntax: ${refs.name} or ${refs.name.property}

    Args:
        text: Text to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    # Find all ${ } patterns
    dollar_pattern = r"\$\{[^}]*\}"

    for match in re.finditer(dollar_pattern, text):
        content = match.group(0)
        # Check if it contains ref() or refs.
        if "ref(" not in content and "refs." not in content:
            return False, f"Invalid context string: {content} - missing ref() or refs. syntax"

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
# New Refs Syntax Helpers - ${refs.name.property}
# ============================================================================


def extract_refs_components(text: str) -> List[Tuple[str, Optional[str]]]:
    """
    Extract all refs.name.property components from a text string.

    Args:
        text: Text containing ${refs.name.property} patterns

    Returns:
        List of tuples (name, property_path) where property_path may be None

    Examples:
        >>> extract_refs_components("${refs.orders.user_id} = ${refs.users.id}")
        [('orders', 'user_id'), ('users', 'id')]
    """
    results = []
    for match in REFS_CONTEXT_PATTERN_COMPILED.finditer(text):
        name = match.group("refs_name")
        property_path = match.group("refs_property")
        # Strip leading dot from property path
        if property_path and property_path.startswith("."):
            property_path = property_path[1:]
        # Convert empty string to None
        property_path = property_path if property_path else None
        results.append((name, property_path))
    return results


def extract_refs_names(text: str) -> Set[str]:
    """
    Extract unique names from ${refs.name} patterns in text.

    Args:
        text: Text containing ${refs.name} patterns

    Returns:
        Set of unique names

    Example:
        >>> extract_refs_names("${refs.orders.id} = ${refs.users.id}")
        {'orders', 'users'}
    """
    return {name for name, _ in extract_refs_components(text)}


def has_refs_pattern(text: str) -> bool:
    """
    Check if text contains any ${refs.name} patterns.

    Args:
        text: Text to check

    Returns:
        True if text contains ${refs.name} patterns
    """
    return bool(REFS_CONTEXT_PATTERN_COMPILED.search(text))


def normalize_ref_to_refs(text: str) -> str:
    """
    Convert legacy ${ref(name).property} syntax to new ${refs.name.property} syntax.

    Args:
        text: Text containing legacy ref() patterns

    Returns:
        Text with all ${ref()} patterns converted to ${refs.} patterns

    Examples:
        >>> normalize_ref_to_refs("${ref(orders).id}")
        "${refs.orders.id}"
        >>> normalize_ref_to_refs("${ref(my-model)}")
        "${refs.my-model}"
    """

    def replacer(model_name: str, property_path: Optional[str]) -> str:
        if property_path:
            return f"${{refs.{model_name}.{property_path}}}"
        return f"${{refs.{model_name}}}"

    return replace_refs(text, replacer)


def normalize_refs_to_ref(text: str) -> str:
    """
    Convert new ${refs.name.property} syntax to legacy ${ref(name).property} syntax.

    This is used during the transition period to normalize for internal processing.

    Args:
        text: Text containing ${refs.name} patterns

    Returns:
        Text with all ${refs.} patterns converted to ${ref()} patterns

    Examples:
        >>> normalize_refs_to_ref("${refs.orders.id}")
        "${ref(orders).id}"
        >>> normalize_refs_to_ref("${refs.my-model}")
        "${ref(my-model)}"
    """

    def replace_match(match):
        name = match.group("refs_name")
        property_path = match.group("refs_property") or ""
        return f"${{ref({name}){property_path}}}"

    return REFS_CONTEXT_PATTERN_COMPILED.sub(replace_match, text)
