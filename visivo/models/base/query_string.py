from typing import Any

import re
from visivo.query.patterns import QUERY_STRING_VALUE_PATTERN


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
            # Accept both ?{...} and ?{...}[N|a:b] forms. The new grammar
            # supports a slicing suffix; the QUERY_STRING_VALUE_PATTERN
            # is the source of truth.
            if not (
                str_value.startswith("?{")
                and (str_value.endswith("}") or re.match(QUERY_STRING_VALUE_PATTERN, str_value))
            ):
                raise ValueError("QueryString must start with '?{' and end with '}' or '}[...]'")
            return cls(str_value)

        return core_schema.no_info_after_validator_function(
            validate_and_create,
            core_schema.str_schema(),
            serialization=core_schema.plain_serializer_function_ser_schema(str),
        )
