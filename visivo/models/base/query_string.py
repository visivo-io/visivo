from typing import Any

import re


QUERY_STRING_VALUE_REGEX = r"^\?\{\s*(?P<query_string>.+)\s*\}\s*$"


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
        matches = re.findall(QUERY_STRING_VALUE_REGEX, self.value)
        if len(matches) == 0:
            return None
        else:
            return matches[0].strip()

    @classmethod
    def __get_pydantic_core_schema__(cls, _source_type: Any, handler: Any):
        from pydantic_core import core_schema

        def validate_and_create(value: Any) -> "QueryString":
            if isinstance(value, cls):
                return value
            str_value = str(value)
            if not (str_value.startswith("?{") and str_value.endswith("}")):
                raise ValueError("QueryString must start with '?{' and end with '}'")
            return cls(str_value)

        return core_schema.no_info_after_validator_function(
            validate_and_create,
            core_schema.str_schema(),
            serialization=core_schema.plain_serializer_function_ser_schema(str),
        )
