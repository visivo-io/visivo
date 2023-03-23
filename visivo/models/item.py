from .base_model import BaseModel, REF_REGEX
from typing import Optional, Union
from .chart import Chart
from pydantic import root_validator, constr


class Item(BaseModel):
    width: int = 1
    markdown: Optional[str]
    chart: Optional[Union[constr(regex=REF_REGEX), Chart]]

    @root_validator
    def check_only_one(cls, values):
        markdown, chart = values.get("markdown"), values.get("chart")
        if markdown is not None and chart is not None:
            raise ValueError(
                'only one of the "markdown" or "chart" properties should be set on an item'
            )
        return values
