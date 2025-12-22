from typing import Annotated, Union

from pydantic import Field

from visivo.models.inputs.types.single_select import SingleSelectInput
from visivo.models.inputs.types.multi_select import MultiSelectInput


InputField = Annotated[
    Union[SingleSelectInput, MultiSelectInput],
    Field(discriminator="type"),
]

"""
Inputs serve as generic value injectors that other components can react to,
rather than pushing changes themselves.

Input Types:
    - single-select: Choose one value from options
    - multi-select: Choose multiple values from options or a range

Single-select accessors:
    - .value: The selected value

Multi-select accessors:
    - .values: Array of selected values
    - .min: Minimum of selected values
    - .max: Maximum of selected values
    - .first: First selected value
    - .last: Last selected value

Example usage:
    inputs:
      - name: region
        type: single-select
        options: ['East', 'West', 'North', 'South']
        display:
          type: dropdown
          default:
            value: 'East'

      - name: categories
        type: multi-select
        options: ['Electronics', 'Clothing', 'Food']
        display:
          type: checkboxes
          default:
            values: all

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
      - name: filtered_sales
        interactions:
          - filter: ?{ region = ${ref(region).value} }
          - filter: ?{ category IN (${ref(categories).values}) }
          - filter: ?{ price BETWEEN ${ref(price_range).min} AND ${ref(price_range).max} }
"""
