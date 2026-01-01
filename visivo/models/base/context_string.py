"""Context string type for project references."""

from typing import Any
import re

from visivo.models.base.pattern_string import PatternString
from visivo.query.patterns import (
    CONTEXT_STRING_REF_PATTERN,
    INLINE_PATH_REGEX,
    CONTEXT_STRING_VALUE_PATTERN,
    get_model_name_from_match,
    FIELD_REF_PATTERN,
    REFS_CONTEXT_PATTERN_COMPILED,
)


class ContextString(PatternString):
    """
    Represents a string that contains a reference to named object in the project model.

    Supports two syntaxes:
    - New (recommended): ${refs.name} or ${refs.name.property}
    - Legacy: ${ref(name)} or ${ref(name).property}

    Examples:
        ${refs.orders}
        ${refs.orders.id}
        ${ref(orders)}       # deprecated
        ${ref(orders).id}    # deprecated
    """

    PATTERN = re.compile(r"^\$\{.*\}$")
    PATTERN_NAME = "reference"
    PATTERN_EXAMPLE = "${refs.name}"

    # Override __eq__ to normalize whitespace
    def __eq__(self, other):
        if isinstance(other, ContextString):
            return re.findall(CONTEXT_STRING_VALUE_PATTERN, self.value) == re.findall(
                CONTEXT_STRING_VALUE_PATTERN, other.value
            )
        return False

    # Override __hash__ to normalize whitespace
    def __hash__(self):
        return hash("".join(re.findall(CONTEXT_STRING_VALUE_PATTERN, self.value)))

    # Override Pydantic schema for ContextString-specific validation
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

    def uses_refs_syntax(self) -> bool:
        """Check if this context string uses the new ${refs.name} syntax."""
        return bool(REFS_CONTEXT_PATTERN_COMPILED.search(self.value))

    def uses_ref_syntax(self) -> bool:
        """Check if this context string uses the legacy ${ref(name)} syntax."""
        return bool(re.search(CONTEXT_STRING_REF_PATTERN, self.value))

    def get_reference(self) -> str:
        """
        Get the referenced object name.

        Works with both new ${refs.name} and legacy ${ref(name)} syntax.

        Returns:
            The object name, or None if no reference found.
        """
        # Try new refs syntax first
        match = REFS_CONTEXT_PATTERN_COMPILED.search(self.value)
        if match:
            return match.group("refs_name")

        # Fall back to legacy ref() syntax
        match = re.search(CONTEXT_STRING_REF_PATTERN, self.value)
        if match:
            return get_model_name_from_match(match)

        return None

    def get_ref_props_path(self) -> str:
        """
        Get the property path after the reference.

        Works with both new ${refs.name.property} and legacy ${ref(name).property} syntax.

        Returns:
            The property path (e.g., ".id" or "[0].name"), empty string if ref exists
            but has no property path, or None if no ref pattern found.
        """
        # Try new refs syntax first
        match = REFS_CONTEXT_PATTERN_COMPILED.search(self.value)
        if match:
            property_path = match.group("refs_property")
            return property_path if property_path else ""

        # Fall back to legacy ref() syntax
        match = re.search(CONTEXT_STRING_REF_PATTERN, self.value)
        if match:
            property_path = match.group("property_path")
            return property_path if property_path else ""

        return None

    def get_path(self) -> str:
        matches = re.findall(INLINE_PATH_REGEX, self.value)
        if len(matches) == 0:
            return None
        else:
            return matches[0]

    def get_item(self, dag: Any) -> Any:
        reference = self.get_reference()
        try:
            return dag.get_descendant_by_name(reference)
        except ValueError:
            raise ValueError(f"Invalid context string reference name: '{reference}'.")

    def get_ref_attr(self) -> str:
        """
        Returns the full reference attribute if present in the string.

        Works with both ${refs.name} and ${ref(name)} syntax.

        Example:
            'year = ${refs.selected_year}' -> '${refs.selected_year}'
            'year = ${ref(Selected Year)}' -> '${ref(Selected Year)}'
        """
        # Try new refs syntax first
        match = REFS_CONTEXT_PATTERN_COMPILED.search(self.value)
        if match:
            return match.group(0)

        # Fall back to legacy ref() syntax
        match = re.search(FIELD_REF_PATTERN, self.value)
        if match:
            return match.group(0)

        return None

    @classmethod
    def is_context_string(cls, obj) -> bool:
        return isinstance(obj, ContextString) or (
            isinstance(obj, str) and ContextString(obj).get_reference()
        )
