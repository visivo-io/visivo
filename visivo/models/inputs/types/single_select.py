"""
Single-select input model.

A single-select input allows choosing one value from a set of options.
"""

from typing import List, Literal, Optional, Union

from pydantic import Field, model_serializer, model_validator

from visivo.models.base.context_string import ContextString
from visivo.models.base.query_string import QueryString
from visivo.models.inputs.input import Input
from visivo.models.inputs.types.display import SingleSelectDisplay


class SingleSelectInput(Input):
    """
    Single-select input for choosing one value from a set of options.

    Options can be defined as a static list or a query that returns values.
    The selected value is accessed using the `.value` accessor in filters.

    Example YAML:
        inputs:
          - name: region
            type: single-select
            options: ['East', 'West', 'North', 'South']
            display:
              type: dropdown
              default:
                value: 'East'

        insights:
          - name: sales_by_region
            interactions:
              - filter: ?{ region = ${ref(region).value} }
    """

    type: Literal["single-select"] = Field(
        default="single-select",
        description="Input type identifier.",
    )
    options: Union[List[str], QueryString] = Field(
        description=(
            "Available options. Can be a static list or a query string. "
            "Query must reference exactly one SqlModel using ${ref(model_name)}."
        ),
    )
    display: Optional[SingleSelectDisplay] = Field(
        default=None,
        description=(
            "Display configuration including UI component type and default value. "
            "If not specified, defaults to dropdown with first option selected."
        ),
    )

    @model_validator(mode="after")
    def validate_query_references(self):
        """
        Validate that query-based options reference exactly one SqlModel.

        This is compile-time validation using Pydantic's model_validator to ensure
        the input can be executed on the source backend during the build phase.

        Raises:
            ValueError: If query doesn't reference exactly one item
        """
        # Only validate query-based options
        if not isinstance(self.options, QueryString):
            return self

        from visivo.query.patterns import extract_ref_names

        query_value = self.options.get_value()
        refs = extract_ref_names(query_value)

        # Must reference exactly one item
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
                f"Single-select inputs must have at least one option."
            )
        return self

    @model_validator(mode="after")
    def validate_toggle_option_count(self):
        """Validate that toggle display type has exactly 2 options."""
        if (
            self.display
            and self.display.type == "toggle"
            and isinstance(self.options, list)
            and len(self.options) != 2
        ):
            raise ValueError(
                f"Input '{self.name}' uses 'toggle' display but has {len(self.options)} options. "
                f"Toggle display requires exactly 2 options."
            )
        return self

    @model_validator(mode="after")
    def validate_default_in_options(self):
        """
        Validate that static default value exists in static options list.

        Only validates when both default and options are static (not query-based).
        Query-based defaults are validated at runtime.
        """
        if (
            self.display
            and self.display.default
            and not isinstance(self.display.default.value, QueryString)
            and isinstance(self.options, list)
        ):
            default_value = self.display.default.value
            if default_value not in self.options:
                raise ValueError(
                    f"Input '{self.name}' default value '{default_value}' not found in options.\n"
                    f"Available options: {', '.join(str(opt) for opt in self.options)}"
                )
        return self

    def child_items(self):
        """
        Return dependencies for DAG construction.

        Extracts ${ref(...)} patterns from query-based options and defaults
        to ensure referenced models are executed before this input.
        """
        from visivo.query.patterns import extract_ref_names

        children = []

        # Check if this input has query-based options
        if isinstance(self.options, QueryString):
            query_str = str(self.options)
            ref_names = extract_ref_names(query_str)
            for ref_name in ref_names:
                children.append(f"ref({ref_name})")
        # Handle legacy ContextString references
        elif ContextString.is_context_string(self.options):
            children.append(self.options)

        # Check for query-based default
        if (
            self.display
            and self.display.default
            and isinstance(self.display.default.value, QueryString)
        ):
            query_str = str(self.display.default.value)
            ref_names = extract_ref_names(query_str)
            for ref_name in ref_names:
                ref_str = f"ref({ref_name})"
                if ref_str not in children:
                    children.append(ref_str)

        return children

    @model_serializer(mode="wrap")
    def serialize_model(self, serializer, _info):
        """
        Custom serializer for single-select inputs.

        Adds name_hash for client-side JSON file lookup.
        """
        model = serializer(self)

        # Add name_hash for viewer to construct JSON URL
        model["name_hash"] = self.name_hash()

        # Convert static list options to strings
        if isinstance(self.options, list):
            model["options"] = [str(option) for option in self.options]

        return model
