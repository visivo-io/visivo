"""
Pattern matching utilities for extracting and validating model references in SQL conditions.

This module provides functions to work with ${ref(model_name).field} syntax used in relations
and other parts of the system where model references need to be extracted and validated.
"""

import re
from typing import Set, Tuple


def extract_model_names(condition: str) -> Set[str]:
    """
    Extract model names from a condition string containing ${ref(model_name).field} patterns.

    Args:
        condition: The condition string to parse

    Returns:
        Set of unique model names found in the condition

    Examples:
        >>> extract_model_names("${ref(orders).user_id} = ${ref(users).id}")
        {'orders', 'users'}

        >>> extract_model_names("${ref(products).category} = 'electronics'")
        {'products'}
    """
    # Pattern matches ${ref(model_name).field_name}
    pattern = r"\$\{ref\(([^)]+)\)\.[^}]+\}"
    matches = re.findall(pattern, condition)
    return set(matches)


def validate_ref_syntax(condition: str) -> Tuple[bool, str]:
    """
    Validate that all ${ref(...)} patterns in the condition have correct syntax.

    Args:
        condition: The condition string to validate

    Returns:
        Tuple of (is_valid, error_message). If valid, error_message is empty.

    Examples:
        >>> validate_ref_syntax("${ref(orders).user_id} = ${ref(users).id}")
        (True, "")

        >>> validate_ref_syntax("${ref(orders)} = ${ref(users).id}")
        (False, "Invalid ref syntax: ${ref(orders)} - missing field reference")
    """
    # Find all ${ref(...)} patterns
    ref_pattern = r"\$\{ref\([^)]*\)[^}]*\}"
    refs = re.findall(ref_pattern, condition)

    # Valid pattern should be ${ref(model_name).field_name}
    valid_pattern = r"\$\{ref\([^)]+\)\.[^}]+\}"

    for ref in refs:
        if not re.match(valid_pattern, ref):
            if not re.match(r"\$\{ref\([^)]+\)\.[^}]*\}", ref):
                return False, f"Invalid ref syntax: {ref} - missing field reference"
            else:
                return (
                    False,
                    f"Invalid ref syntax: {ref} - check format should be ${{ref(model).field}}",
                )

    return True, ""


def count_model_references(condition: str) -> int:
    """
    Count the total number of model references in a condition.

    Args:
        condition: The condition string to analyze

    Returns:
        Total count of ${ref(...)} patterns found

    Examples:
        >>> count_model_references("${ref(orders).user_id} = ${ref(users).id}")
        2

        >>> count_model_references("${ref(orders).total} > 100 AND ${ref(orders).status} = 'active'")
        2
    """
    pattern = r"\$\{ref\([^)]+\)\.[^}]+\}"
    matches = re.findall(pattern, condition)
    return len(matches)
