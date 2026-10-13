from typing import Any

import re
from visivo.query.patterns import QUERY_STRING_VALUE_PATTERN


def _query_string_rejection(value: str) -> str:
    """Say which way the value missed, not just that it did.

    The three ways a value reaches this function are distinguishable, and the
    fix is different for each, so name them.
    """
    shown = value if len(value) <= 120 else value[:117] + "..."
    if not value.startswith("?{"):
        return (
            "QueryString must be wrapped in '?{ }' (optionally followed by an "
            f"[index|slice] suffix). Got: {shown!r}"
        )
    if re.match(r"^\?\{\s*\}\s*$", value, re.DOTALL):
        return f"QueryString '?{{ }}' needs an expression between the braces. Got: {shown!r}"
    if re.search(r"[\r\n]", value):
        return (
            "QueryString '?{ }' expressions must be on a single line — a newline "
            f"inside the braces cannot be parsed. Got: {shown!r}"
        )
    return (
        "QueryString must be '?{ expression }', optionally followed by an "
        f"[index|slice] suffix such as [0], [1:5], [::2] or [0,2]. Got: {shown!r}"
    )


class QueryString:
    """
    Adds the value of the query string to the query.
    This allows you to reference the output of the query in your chart

    ?{ x }
    """

    def __init__(self, value: str):
        self.value = value

    def __str__(self):
        return self.value

    def get_value(self) -> str:
        try:
            match = re.match(QUERY_STRING_VALUE_PATTERN, self.value)
            if match is None:
                return None
            return match.group("query_string").strip()
        except Exception:
            return None

    def get_slice(self) -> str:
        """Return the literal slice suffix (``"[0]"``, ``"[1:5]"``, ...) if
        the query string carries one, else ``None``."""
        try:
            match = re.match(QUERY_STRING_VALUE_PATTERN, self.value)
            if match is None:
                return None
            return match.group("slice")
        except Exception:
            return None

    @classmethod
    def __get_pydantic_core_schema__(cls, _source_type: Any, handler: Any):
        from pydantic_core import core_schema

        def validate_and_create(value: Any) -> "QueryString":
            if isinstance(value, cls):
                return value
            str_value = str(value)
            # QUERY_STRING_VALUE_PATTERN is the source of truth, so this gate
            # applies it rather than approximating it.
            #
            # The gate used to be `startswith("?{") and endswith("}")`, which is
            # WIDER than the pattern `get_value()` reads the body with. Values in
            # the gap — `?{}`, and any body carrying an interior newline —
            # validated fine, were written to YAML, and then made `get_value()`
            # return None. The failure surfaced much later and nowhere near the
            # field: `InsightInteraction.field_values_with_js_template_literals`
            # calls `re.sub(..., None)` and the run dies with
            # `TypeError: expected string or bytes-like object, got 'NoneType'`.
            #
            # Refusing them here turns that into a validation error naming the
            # field and the value.
            match = re.match(QUERY_STRING_VALUE_PATTERN, str_value)
            # `?{  }` matches the pattern (the body group swallows the spaces)
            # but `get_value()` hands back the empty string, so it is the same
            # empty expression as `?{}` by another spelling.
            if match is None or not match.group("query_string").strip():
                raise ValueError(_query_string_rejection(str_value))
            return cls(str_value)

        return core_schema.no_info_after_validator_function(
            validate_and_create,
            core_schema.str_schema(),
            serialization=core_schema.plain_serializer_function_ser_schema(str),
        )
