from enum import Enum
from pydantic import Field
from visivo.models.base.base_model import BaseModel

# The viewer interpolates the gradient by parsing hex only (cellFormatting.js),
# so anything else (`red`, `rgb(...)`) rendered as `rgb(NaN, NaN, NaN)`
# (VIS-1463 T4). Reject it at the model.
HEX_COLOR_PATTERN = r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"


class FormatCellsScope(str, Enum):
    row = "row"
    column = "column"
    table = "table"


class FormatCells(BaseModel):
    """
    Configure gradient/heatmap cell formatting for table cells.

    Applies a color gradient to numeric cells based on their values,
    interpolating between min_color and max_color.

    ### Example
    ``` yaml
    format_cells:
      scope: column
      min_color: "#ff0000"
      max_color: "#00ff00"
    ```
    """

    scope: FormatCellsScope = Field(
        description="Scope for gradient calculation: 'row' computes min/max per row, "
        "'column' per column, 'table' across all numeric cells."
    )
    min_color: str = Field(
        pattern=HEX_COLOR_PATTERN,
        description="Hex color for minimum values, e.g. '#ff0000' (3- or 6-digit hex; "
        "named colors such as 'red' are not supported).",
    )
    max_color: str = Field(
        pattern=HEX_COLOR_PATTERN,
        description="Hex color for maximum values, e.g. '#00ff00' (3- or 6-digit hex; "
        "named colors such as 'red' are not supported).",
    )
