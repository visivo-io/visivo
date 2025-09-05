"""
Shared patterns and utilities for parsing context strings and references.

This module provides a single source of truth for regex patterns used throughout
the query resolution system, eliminating duplication and ensuring consistency.
"""

import re
from typing import Tuple, Optional, List, Set


# Core pattern for ${ref(model).field} or ${ref('model').field}
# Captures: (quoted_model, unquoted_model, field)
REF_PATTERN = r'\$\{\s*ref\((?:[\'"]([^\'\"]+)[\'"]|([^)]+))\)(?:\.([^}]+))?\s*\}'

# Compiled version for performance
REF_PATTERN_COMPILED = re.compile(REF_PATTERN)


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
        # Either group 1 (quoted) or group 2 (unquoted) has the model name
        model_name = (match.group(1) or match.group(2)).strip()
        field_name = match.group(3).strip() if match.group(3) else None
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
        model_name = (match.group(1) or match.group(2)).strip()
        field_name = match.group(3).strip() if match.group(3) else None
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
