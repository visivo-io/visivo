"""
Display configuration models for input types.

These models define the UI component type and default values for inputs.
"""

from typing import List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, model_validator

from visivo.models.base.query_string import QueryString


# Type alias for primitive values that can be used in inputs
Primitive = Union[str, int, float, bool]

# Type alias for values that can be static, query-based, or date expressions
InputValue = Union[Primitive, QueryString]


class SingleSelectDefault(BaseModel):
    """Default value configuration for single-select inputs."""

    model_config = ConfigDict(extra="forbid")

    value: InputValue = Field(description="Default selected value. Can be static value or query.")


class SingleSelectDisplay(BaseModel):
    """Display configuration for single-select inputs."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["dropdown", "radio", "toggle", "tabs", "autocomplete", "slider"] = Field(
        default="dropdown",
        description="UI component type for rendering the input.",
    )
    default: Optional[SingleSelectDefault] = Field(
        default=None,
        description="Default value configuration. If not specified, first option is used.",
    )


class RangeConfig(BaseModel):
    """
    Configuration for range-based multi-select inputs.

    Range inputs generate stepped values between start and end bounds.
    Values are computed at frontend runtime, not during compile/run.
    """

    model_config = ConfigDict(extra="forbid")

    start: InputValue = Field(
        description="Lower bound. Can be static value, query, or date expression."
    )
    end: InputValue = Field(
        description="Upper bound. Can be static value, query, or date expression."
    )
    step: InputValue = Field(
        description="Step increment. Required. Can be static value, query, or time unit string."
    )


class MultiSelectDefault(BaseModel):
    """
    Default value configuration for multi-select inputs.

    For list-based inputs: use 'values' field
    For range-based inputs: use 'start' and 'end' fields
    """

    model_config = ConfigDict(extra="forbid")

    # For list-based multi-select
    values: Optional[Union[List[Primitive], QueryString, Literal["all", "none"]]] = Field(
        default=None,
        description=(
            "Default selected values for list-based inputs. "
            "Can be static list, query, 'all' (default), or 'none'."
        ),
    )

    # For range-based multi-select
    start: Optional[InputValue] = Field(
        default=None,
        description="Default lower bound for range-based inputs.",
    )
    end: Optional[InputValue] = Field(
        default=None,
        description="Default upper bound for range-based inputs.",
    )

    @model_validator(mode="after")
    def validate_default_structure(self):
        """
        Validate that default configuration matches input structure.

        Either 'values' OR ('start' and 'end') should be specified, not both.
        """
        has_values = self.values is not None
        has_range = self.start is not None or self.end is not None

        if has_values and has_range:
            raise ValueError(
                "MultiSelectDefault cannot have both 'values' and 'start/end'. "
                "Use 'values' for list-based inputs or 'start/end' for range-based inputs."
            )

        # If range-based, both start and end should be specified
        if has_range and (self.start is None or self.end is None):
            raise ValueError("Range-based default must specify both 'start' and 'end'.")

        return self


class MultiSelectDisplay(BaseModel):
    """Display configuration for multi-select inputs."""

    model_config = ConfigDict(extra="forbid")

    type: Literal["dropdown", "checkboxes", "chips", "tags", "range-slider", "date-range"] = Field(
        default="dropdown",
        description="UI component type for rendering the input.",
    )
    default: Optional[MultiSelectDefault] = Field(
        default=None,
        description="Default value configuration. If not specified, 'all' is used for list-based.",
    )
