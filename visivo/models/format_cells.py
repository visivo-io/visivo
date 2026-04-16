from enum import Enum
from pydantic import Field
from visivo.models.base.base_model import BaseModel


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
    min_color: str = Field(description="Hex color for minimum values, e.g. '#ff0000'")
    max_color: str = Field(description="Hex color for maximum values, e.g. '#00ff00'")
