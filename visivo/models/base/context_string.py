from typing import Any

from visivo.models.base.base_model import REF_REGEX, INLINE_REF_REGEX
import re


class ContextString:
    def __init__(self, value: str):
        self.value = value

    def __str__(self):
        return self.value

    def get_references(self):
        return re.findall(INLINE_REF_REGEX, self.value)

    @classmethod
    def __get_pydantic_core_schema__(cls, _source_type: Any, handler: Any):
        return handler.generate_schema(str)
