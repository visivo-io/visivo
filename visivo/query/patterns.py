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

# Simple ref pattern: ref(name) without ${ }
# Used for validation in Pydantic models
# Example: ref(orders)
REF_REGEX = rf"^ref\(\s*(?P<ref_name>[{NAME_REGEX}]+)\)$"

# Core pattern for ${ref(model).field} or ${ref('model').field} or ${ref('model')[0]}
# Captures: model_name (with quotes stripped), field_name (optional, without leading dot/bracket)
# This is the most flexible pattern used in query resolution
# The model_name capture handles both quoted 'model' and unquoted model
# field_name captures property paths like "nested.property" or "[0]" or "list[0].property"
# field_name is optional - will be None if not present
REF_PATTERN = r'\$\{\s*ref\([\'"]?(?P<model_name>[^\'")\s]+)[\'"]?\s*\)(?P<field_name>[\.\d\w\[\]]*?)\s*\}'

# Metric/dimension reference pattern: ${ref(name)} or ${ref(model).metric}
# Captures: (model_or_metric_name, optional_field_name)
# Used specifically for metric and dimension resolution
METRIC_REF_PATTERN = r"\$\{\s*ref\(([^)]+)\)(?:\.([^}]+))?\s*\}"


# ============================================================================
# Context String Patterns - ${ } general syntax
# ============================================================================

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

REF_PATTERN_COMPILED = re.compile(REF_PATTERN)
METRIC_REF_PATTERN_COMPILED = re.compile(METRIC_REF_PATTERN)


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

        >>> extract_ref_components("${ref('my-model.v2').id}")
        [('my-model.v2', 'id')]
    """
    results = []
    for match in REF_PATTERN_COMPILED.finditer(text):
        model_name = match.group('model_name').strip()
        field_name_raw = match.group('field_name').strip() if match.group('field_name') else None
        # Strip leading dot from field_name if present (e.g., ".id" -> "id")
        field_name = field_name_raw.lstrip('.') if field_name_raw and field_name_raw.startswith('.') else field_name_raw
        # Convert empty string to None
        field_name = field_name if field_name else None
        results.append((model_name, field_name))
    return results


def extract_model_names(text: str) -> Set[str]:
    """
    Extract unique model names from ref() patterns in text.

    Args:
        text: Text containing ${ref(model)} patterns

    Returns:
        Set of unique model names

    Example:
        >>> extract_model_names("${ref(orders).id} = ${ref(users).id}")
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
        model_name = match.group('model_name').strip()
        field_name_raw = match.group('field_name').strip() if match.group('field_name') else None
        # Strip leading dot from field_name if present (e.g., ".id" -> "id")
        field_name = field_name_raw.lstrip('.') if field_name_raw and field_name_raw.startswith('.') else field_name_raw
        # Convert empty string to None
        field_name = field_name if field_name else None
        return replacer_func(model_name, field_name)

    return REF_PATTERN_COMPILED.sub(replace_match, text)


def has_ref_pattern(text: str) -> bool:
    """
    Check if text contains any ref() patterns.

    Args:
        text: Text to check

    Returns:
        True if text contains ${ref(...)} patterns
    """
    return bool(REF_PATTERN_COMPILED.search(text))


def validate_ref_syntax(text: str) -> Tuple[bool, Optional[str]]:
    """
    Validate that all ${ } patterns in text contain valid ref() calls.

    Args:
        text: Text to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    # Find all ${ } patterns
    dollar_pattern = r"\$\{[^}]*\}"

    for match in re.finditer(dollar_pattern, text):
        content = match.group(0)
        # Check if it contains ref()
        if "ref(" not in content:
            return False, f"Invalid context string: {content} - missing ref() function"

    return True, None


def count_model_references(text: str) -> int:
    """
    Count the number of unique models referenced in text.

    Args:
        text: Text containing ${ref(model)} patterns

    Returns:
        Number of unique models referenced
    """
    return len(extract_model_names(text))
