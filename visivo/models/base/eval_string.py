from typing import Any, List

import re

from visivo.models.base.context_string import ContextString

INLINE_CONTEXT_STRING_REGEX = r"\${\s*ref\([a-zA-Z0-9\s'\"\-_]+?\)\s*}"


class EvalString:
    def __init__(self, value: str):
        self.value = value

    def __str__(self):
        return self.value

    def get_context_strings(self) -> List[ContextString]:
        return list(
            map(
                lambda m: ContextString(m),
                re.findall(INLINE_CONTEXT_STRING_REGEX, self.value),
            )
        )

    @classmethod
    def __get_pydantic_core_schema__(cls, _source_type: Any, handler: Any):
        from pydantic_core import core_schema

        def validate_and_create(value: Any) -> "EvalString":
            if isinstance(value, cls):
                return value
            str_value = str(value)
            if not (str_value.startswith(">{") and str_value.endswith("}")):
                raise ValueError("ContextString must start with '>{' and end with '}'")
            return cls(str_value)

        return core_schema.no_info_after_validator_function(
            validate_and_create,
            core_schema.str_schema(),
            serialization=core_schema.plain_serializer_function_ser_schema(str),
        )
