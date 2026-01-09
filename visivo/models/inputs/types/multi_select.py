"""
Multi-select input model.

A multi-select input allows choosing multiple values from a set of options.
Supports two mutually exclusive ways to define options:
1. List-based: discrete choices via 'options' field
2. Range-based: continuous/stepped values via 'range' field
"""

from typing import List, Literal, Optional, Union

from pydantic import Field, model_serializer, model_validator

from visivo.models.base.context_string import ContextString
from visivo.models.base.query_string import QueryString
from visivo.models.inputs.input import Input
from visivo.models.inputs.types.display import MultiSelectDisplay, RangeConfig


class MultiSelectInput(Input):
    """
    Multi-select input for choosing multiple values.

    Options can be defined in two ways (mutually exclusive):
    1. List-based ('options' field): Discrete choices from a static list or query
    2. Range-based ('range' field): Continuous/stepped values with start, end, step

    Selected values are accessed using these accessors in filters:
    - `.values` - Array of all selected values
    - `.min` - Minimum of selected values
    - `.max` - Maximum of selected values
    - `.first` - First selected value
    - `.last` - Last selected value

    Example YAML (list-based):
        inputs:
          - name: regions
            type: multi-select
            options: ['East', 'West', 'North', 'South']
            display:
              type: dropdown
              default:
                values: ['East', 'West']

        insights:
          - name: sales_by_region
            interactions:
              - filter: ?{ region IN (${ref(regions).values}) }

    Example YAML (range-based):
        inputs:
          - name: price_range
            type: multi-select
            range:
              start: 0
              end: 1000
              step: 50
            display:
              type: range-slider
              default:
                start: 100
                end: 500

        insights:
          - name: products_in_range
            interactions:
              - filter: ?{ price BETWEEN ${ref(price_range).min} AND ${ref(price_range).max} }
    """

    type: Literal["multi-select"] = Field(
        default="multi-select",
        description="Input type identifier.",
    )
    options: Optional[Union[List[str], QueryString]] = Field(
        default=None,
        description=(
            "Available options for list-based multi-select. "
            "Can be a static list or a query string. "
            "Mutually exclusive with 'range'."
        ),
    )
    range: Optional[RangeConfig] = Field(
        default=None,
        description=(
            "Range configuration for range-based multi-select. "
            "Defines start, end, and step values. "
            "Mutually exclusive with 'options'."
        ),
    )
    display: Optional[MultiSelectDisplay] = Field(
        default=None,
        description=(
            "Display configuration including UI component type and default values. "
            "If not specified, defaults to dropdown with all options selected."
        ),
    )

    @model_validator(mode="after")
    def validate_options_or_range(self):
        """
        Validate that exactly one of 'options' or 'range' is specified.

        These are mutually exclusive - an input uses one approach or the other.
        """
        has_options = self.options is not None
        has_range = self.range is not None

        if has_options and has_range:
            raise ValueError(
                f"Input '{self.name}' has both 'options' and 'range' defined. "
                f"Multi-select inputs must use either 'options' OR 'range', not both."
            )

        if not has_options and not has_range:
            raise ValueError(
                f"Input '{self.name}' must specify either 'options' or 'range'. "
                f"Use 'options' for discrete choices or 'range' for continuous/stepped values."
            )

        return self

    @model_validator(mode="after")
    def validate_query_references(self):
        """
        Validate that query-based options reference exactly one SqlModel.

        Only applies to list-based inputs with query options.
        """
        if not isinstance(self.options, QueryString):
            return self

        from visivo.query.patterns import extract_ref_names

        query_value = self.options.get_value()
        refs = extract_ref_names(query_value)

        if len(refs) == 0:
            raise ValueError(
                f"Input '{self.name}' query must reference exactly one model using ${{ref(model_name)}}.\n"
                f"Example: ?{{ SELECT DISTINCT category FROM ${{ref(products)}} }}"
            )

        if len(refs) > 1:
            raise ValueError(
                f"Input '{self.name}' query references {len(refs)} items ({', '.join(refs)}) "
                f"but must reference exactly one model.\n"
                f"Example: ?{{ SELECT DISTINCT category FROM ${{ref(products)}} }}"
            )

        return self

    @model_validator(mode="after")
    def validate_static_options_not_empty(self):
        """Validate that static options list is not empty."""
        if isinstance(self.options, list) and len(self.options) == 0:
            raise ValueError(
                f"Input '{self.name}' has empty options list. "
                f"Multi-select inputs must have at least one option."
            )
        return self

    @model_validator(mode="after")
    def validate_default_structure_matches_input(self):
        """
        Validate that default structure matches input structure.

        - List-based inputs should use 'default.values'
        - Range-based inputs should use 'default.start' and 'default.end'
        """
        if not self.display or not self.display.default:
            return self

        default = self.display.default
        is_list_based = self.options is not None
        is_range_based = self.range is not None

        # Check for mismatched default structure
        if is_list_based and (default.start is not None or default.end is not None):
            raise ValueError(
                f"Input '{self.name}' uses 'options' but default uses 'start/end'. "
                f"Default structure must match input structure. Use 'default.values' instead."
            )

        if is_range_based and default.values is not None:
            raise ValueError(
                f"Input '{self.name}' uses 'range' but default uses 'values'. "
                f"Default structure must match input structure. "
                f"Use 'default.start' and 'default.end' instead."
            )

        return self

    @model_validator(mode="after")
    def validate_default_values_in_options(self):
        """
        Validate that static default values exist in static options list.

        Only validates when both default values and options are static.
        """
        if (
            self.display
            and self.display.default
            and self.display.default.values is not None
            and isinstance(self.display.default.values, list)
            and isinstance(self.options, list)
        ):
            for value in self.display.default.values:
                if value not in self.options:
                    raise ValueError(
                        f"Input '{self.name}' default value '{value}' not found in options.\n"
                        f"Available options: {', '.join(str(opt) for opt in self.options)}"
                    )
        return self

    @model_validator(mode="after")
    def validate_display_type_compatibility(self):
        """
        Validate that display type is compatible with input structure.

        'date-range' display is only valid for range-based inputs.
        """
        if (
            self.display
            and self.display.type == "date-range"
            and self.options is not None  # list-based
        ):
            raise ValueError(
                f"Input '{self.name}' uses display 'date-range' which is only valid "
                f"for range-based multi-select inputs.\n"
                f"Valid displays for list-based multi-select: dropdown, checkboxes, chips, tags, range-slider"
            )
        return self

    def child_items(self):
        """
        Return dependencies for DAG construction.

        Extracts ${ref(...)} patterns from:
        - Query-based options
        - Query-based range.start, range.end, range.step
        - Query-based defaults
        """
        from visivo.query.patterns import extract_ref_names

        children = []

        # Check list-based options
        if isinstance(self.options, QueryString):
            query_str = str(self.options)
            ref_names = extract_ref_names(query_str)
            for ref_name in ref_names:
                children.append(f"ref({ref_name})")
        elif ContextString.is_context_string(self.options):
            children.append(self.options)

        # Check range-based values
        if self.range:
            for field_name in ["start", "end", "step"]:
                field_value = getattr(self.range, field_name)
                # Handle both QueryString instances and query-pattern strings
                if isinstance(field_value, QueryString) or (
                    isinstance(field_value, str) and "?{" in field_value
                ):
                    query_str = str(field_value)
                    ref_names = extract_ref_names(query_str)
                    for ref_name in ref_names:
                        ref_str = f"ref({ref_name})"
                        if ref_str not in children:
                            children.append(ref_str)

        # Check for query-based defaults
        if self.display and self.display.default:
            default = self.display.default

            # List-based default values
            if isinstance(default.values, QueryString):
                query_str = str(default.values)
                ref_names = extract_ref_names(query_str)
                for ref_name in ref_names:
                    ref_str = f"ref({ref_name})"
                    if ref_str not in children:
                        children.append(ref_str)

            # Range-based default start/end
            for field_name in ["start", "end"]:
                field_value = getattr(default, field_name, None)
                if isinstance(field_value, QueryString):
                    query_str = str(field_value)
                    ref_names = extract_ref_names(query_str)
                    for ref_name in ref_names:
                        ref_str = f"ref({ref_name})"
                        if ref_str not in children:
                            children.append(ref_str)

        return children

    def is_range_based(self) -> bool:
        """Check if this input uses range-based configuration."""
        return self.range is not None

    def is_list_based(self) -> bool:
        """Check if this input uses list-based options."""
        return self.options is not None

    @model_serializer(mode="wrap")
    def serialize_model(self, serializer, _info):
        """
        Custom serializer for multi-select inputs.

        Adds name_hash and structure type for client-side handling.
        """
        model = serializer(self)

        # Add name_hash for viewer to construct JSON URL
        model["name_hash"] = self.name_hash()

        # Add structure type for frontend to know how to handle this input
        model["structure"] = "range" if self.is_range_based() else "options"

        # Convert static list options to strings
        if isinstance(self.options, list):
            model["options"] = [str(option) for option in self.options]

        return model
