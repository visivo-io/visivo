from typing import Annotated, Union

from pydantic import Field

from visivo.models.inputs.dropdown import DropdownInput

InputField = Annotated[
    Union[DropdownInput],
    Field(discriminator="type"),
]
"""
Inputs serve as generic value injectors that other components can react to,
rather than pushing changes themselves.

Input Types:
    - dropdown: Single or multi-select options
    - tabs: Mutually exclusive selection
    - text: Freeform input with optional regex validation
    - slider: Numeric range selection
    - toggle: Boolean true/false
    - date: Date/time selection

Example usage
inputs:
    - name: date-range
    type: date
    label: "Select Date Range"
    min: 2020-01-01
    default: 2024-01-01

    - name: sales-region
    type: dropdown
    label: "Region"
    options:
        - North
        - South
        - East
        - West
    default: "North"

    - name: product-categories
    type: dropdown
    label: "Product Category"
    options: ${ select distinct(category) from ${ref(products_insight)} }

"""
