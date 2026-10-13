"""Validate field access in Visivo references before resolving them as SQL."""

import re

from visivo.query.patterns import CONTEXT_STRING_REF_PATTERN_COMPILED

_EXTERNAL_FIELD_PATH = re.compile(r'\s*(?P<path>(?:\.(?:\w+|"(?:[^"]|"")+")(?:\[\d+\])*)+)')


def validate_field_reference_syntax(expression: str) -> str:
    for match in CONTEXT_STRING_REF_PATTERN_COMPILED.finditer(expression):
        if match.group("property_path"):
            continue
        accessor = _EXTERNAL_FIELD_PATH.match(expression, match.end())
        if accessor:
            reference = match.group(0)
            path = accessor.group("path")
            corrected = reference[:-1].rstrip() + path + "}"
            raise ValueError(
                f"Invalid field reference '{reference}{path}': put the field accessor "
                f"inside the reference braces. Use '{corrected}'."
            )
    return expression
