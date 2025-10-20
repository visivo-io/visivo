from typing import Optional, Dict, Tuple, List
from pydantic import BaseModel, Field

from visivo.models.fields import QueryOrStringField


class InsightInteraction(BaseModel):
    """
    Represents a client-side interaction that can be applied to insight data.
    """

    filter: Optional[QueryOrStringField] = Field(
        None, description="Filter expression to apply to the data on the client side"
    )
    split: Optional[QueryOrStringField] = Field(
        None, description="Column or expression to split data into multiple traces"
    )
    sort: Optional[QueryOrStringField] = Field(
        None, description="Column or expression to sort data by"
    )

    @property
    def field_values(self) -> Dict[str, QueryOrStringField]:
        """Return a dictionary of field names to their non-None values.

        Returns:
            Dictionary with keys 'filter', 'split', 'sort' mapped to their values,
            only including fields that are not None.
        """
        fields = {}
        for field_name in ["filter", "split", "sort"]:
            field_value = getattr(self, field_name, None)
            if field_value is not None:
                fields[field_name] = field_value
        return fields

    def extract_query_strings(self, prefix: str = "interaction") -> List[Tuple[str, str]]:
        pass
