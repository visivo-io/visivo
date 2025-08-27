import re
from typing import Any
from pydantic import BaseModel, ConfigDict, model_validator
from visivo.models.base.query_string import QUERY_STRING_VALUE_REGEX, QueryString


class InsightColumns(BaseModel):
    """
    Insight Columns enable you to include additional data fields that can be used 
    for client-side interactions without being directly mapped to visualization properties.
    
    Unlike Trace Columns, Insight Columns are designed for client-side interactions
    through DuckDB WASM execution, not for visualization property mapping.
    
    !!! example
        ```yaml
        insights:
          - name: revenue-by-month
            columns:
              region: ?{ region }
              category: ?{ category }
            interactions:
              - split: ?{ region }  # Uses the region column from columns
              - filter: ?{ category = 'Electronics' }  # Uses the category column
        ```
    """

    model_config = ConfigDict(extra="allow")

    @model_validator(mode="before")
    @classmethod
    def validate_and_convert_query_strings(cls, data: Any):
        """
        Convert string values matching the query pattern to QueryString objects.
        This enables the ?{...} syntax for client-side interactions.
        """
        if isinstance(data, dict):
            for field_name, field_value in data.items():
                if isinstance(field_value, str) and re.match(QUERY_STRING_VALUE_REGEX, field_value):
                    data[field_name] = QueryString(field_value)
        return data