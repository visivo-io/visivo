"""
Input accessor validation module.

Validates that input accessor usage (e.g., ${ref(input).value}) matches the input type:
- Single-select inputs: only .value accessor allowed
- Multi-select inputs: only .values, .min, .max, .first, .last accessors allowed
"""

from typing import Dict, List, Tuple

from visivo.query.patterns import (
    extract_input_accessors,
    SINGLE_SELECT_ACCESSORS,
    MULTI_SELECT_ACCESSORS,
    ALL_INPUT_ACCESSORS,
)


class AccessorValidationError(ValueError):
    """Raised when an input accessor is used incorrectly."""

    pass


def validate_input_accessor(input_name: str, accessor: str, input_type: str) -> None:
    """
    Validate that an accessor is compatible with an input type.

    Args:
        input_name: Name of the input being referenced
        accessor: The accessor being used (e.g., 'value', 'values', 'min')
        input_type: The type of input ('single-select' or 'multi-select')

    Raises:
        AccessorValidationError: If the accessor is incompatible with the input type
    """
    # Validate accessor is known
    if accessor not in ALL_INPUT_ACCESSORS:
        valid_accessors = ", ".join(sorted(ALL_INPUT_ACCESSORS))
        raise AccessorValidationError(
            f"Input '{input_name}' uses unknown accessor '.{accessor}'\n"
            f"Valid accessors are: {valid_accessors}"
        )

    # Validate single-select accessors
    if input_type == "single-select":
        if accessor not in SINGLE_SELECT_ACCESSORS:
            if accessor == "values":
                raise AccessorValidationError(
                    f"Input '{input_name}' is single-select but was referenced with .values\n"
                    f"Did you mean .value? Single-select inputs must use .value accessor."
                )
            elif accessor in MULTI_SELECT_ACCESSORS:
                raise AccessorValidationError(
                    f"Input '{input_name}' is single-select but was referenced with .{accessor}\n"
                    f"The .{accessor} accessor is only valid for multi-select inputs."
                )

    # Validate multi-select accessors
    elif input_type == "multi-select":
        if accessor not in MULTI_SELECT_ACCESSORS:
            if accessor == "value":
                raise AccessorValidationError(
                    f"Input '{input_name}' is multi-select but was referenced with .value\n"
                    f"Did you mean .values? Multi-select inputs must use .values accessor."
                )


def validate_all_input_accessors(
    query: str,
    inputs_map: Dict[str, str],
) -> List[Tuple[str, str]]:
    """
    Validate all input accessors in a query against input definitions.

    Args:
        query: SQL query string containing ${ref(input_name).accessor} patterns
        inputs_map: Dictionary mapping input names to their types
                   e.g., {'region': 'single-select', 'categories': 'multi-select'}

    Returns:
        List of validated (input_name, accessor) tuples

    Raises:
        AccessorValidationError: If any accessor is incompatible with its input type
        ValueError: If an input is referenced but not defined in inputs_map
    """
    accessors = extract_input_accessors(query)
    validated = []

    for input_name, accessor in accessors:
        # Check if input exists
        if input_name not in inputs_map:
            raise ValueError(
                f"Input placeholder '${{{input_name}}}' references undefined input.\n"
                f"Make sure input '{input_name}' is defined in your project."
            )

        input_type = inputs_map[input_name]
        validate_input_accessor(input_name, accessor, input_type)
        validated.append((input_name, accessor))

    return validated


def get_accessor_sample_value(accessor: str, options: List, default_value=None) -> str:
    """
    Get a sample value appropriate for an accessor type.

    Used during SQLGlot parsing to replace placeholders with type-appropriate values.

    Args:
        accessor: The accessor type ('value', 'values', 'min', 'max', 'first', 'last')
        options: List of available options for the input
        default_value: Optional default value to use

    Returns:
        A sample value string suitable for SQL parsing
    """
    if not options:
        # Fallback when no options available
        if accessor == "values":
            return "'sample_value'"
        return "0"

    if accessor == "value":
        # Single value for single-select
        return str(default_value if default_value is not None else options[0])

    elif accessor == "values":
        # Comma-separated quoted values for IN clause
        sample_values = options[:2] if len(options) >= 2 else options
        quoted = [f"'{v}'" if isinstance(v, str) else str(v) for v in sample_values]
        return ", ".join(quoted)

    elif accessor in ("min", "first"):
        # First/minimum value
        value = default_value if default_value is not None else options[0]
        return str(value)

    elif accessor in ("max", "last"):
        # Last/maximum value
        value = default_value if default_value is not None else options[-1]
        return str(value)

    # Unknown accessor - return first option as fallback
    return str(options[0])
