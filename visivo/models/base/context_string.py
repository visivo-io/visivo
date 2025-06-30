from typing import Any

import re

from visivo.models.dag import all_descendants_with_name

NAME_REGEX = r"a-zA-Z0-9\s'\"\-_"
INLINE_REF_REGEX = rf"\${{\s*ref\(([{NAME_REGEX}]+?)\)[\.\d\w\[\]]*\s*}}"
INLINE_REF_PROPS_PATH_REGEX = rf"\${{\s*ref\([{NAME_REGEX}]+?\)([\.\d\w\[\]]*)\s*}}"
INLINE_PATH_REGEX = rf"\${{\s*([{NAME_REGEX}\.\[\]]+?)\s*}}"
CONTEXT_STRING_VALUE_REGEX = rf"\${{\s*([{NAME_REGEX}\.\[\]\)\()]+?)\s*}}"


class ContextString:
    """
    Represents a string that contains a reference to named object in the project model.
    Currently you can reference another object by using the ref() function.  Example:

    ${ ref(Name) }
    """

    def __init__(self, value: str):
        self.value = value

    def __str__(self):
        return self.value

    def __eq__(self, other):
        if isinstance(other, ContextString):
            return re.findall(CONTEXT_STRING_VALUE_REGEX, self.value) == re.findall(
                CONTEXT_STRING_VALUE_REGEX, other.value
            )
        return False

    def __hash__(self):
        return hash("".join(re.findall(CONTEXT_STRING_VALUE_REGEX, self.value)))

    def get_reference(self) -> str:
        matches = re.findall(INLINE_REF_REGEX, self.value)
        if len(matches) == 0:
            return None
        else:
            return matches[0]

    def get_ref_props_path(self) -> str:
        matches = re.findall(INLINE_REF_PROPS_PATH_REGEX, self.value)
        if len(matches) == 0:
            return None
        else:
            return matches[0]

    def get_path(self) -> str:
        matches = re.findall(INLINE_PATH_REGEX, self.value)
        if len(matches) == 0:
            return None
        else:
            return matches[0]

    def get_item(self, dag: Any) -> Any:
        reference = self.get_reference()
        items = all_descendants_with_name(reference, dag)
        if len(items) == 0:
            raise ValueError(f"Invalid context string reference name: '{reference}'.")
        return items[0]

    @classmethod
    def is_context_string(cls, obj) -> bool:
        return isinstance(obj, ContextString) or (
            isinstance(obj, str) and ContextString(obj).get_reference()
        )

    @classmethod
    def __get_pydantic_core_schema__(cls, _source_type: Any, handler: Any):
        from pydantic_core import core_schema

        def validate_and_create(value: Any) -> "ContextString":
            if isinstance(value, cls):
                return value
            str_value = str(value)
            if not (str_value.startswith("${") and str_value.endswith("}")):
                raise ValueError("ContextString must start with '${' and end with '}'")
            return cls(str_value)

        return core_schema.no_info_after_validator_function(
            validate_and_create,
            core_schema.str_schema(pattern=r"^\$\{.*\}$"),
            serialization=core_schema.plain_serializer_function_ser_schema(str),
        )
