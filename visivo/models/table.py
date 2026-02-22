from typing import Any, List, Optional, TypeAlias
import warnings

from visivo.models.base.selector_model import SelectorModel
from visivo.models.insight import Insight
from visivo.models.table_column_definition import TableColumnDefinition
from visivo.models.trace import Trace
from pydantic import Field
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.base.base_model import generate_ref_field

from pydantic import model_validator
from enum import IntEnum

TraceRef: TypeAlias = generate_ref_field(Trace)
InsightRef: TypeAlias = generate_ref_field(Insight)


class RowsPerPageEnum(IntEnum):
    three = 3
    five = 5
    ten = 15
    twenty_five = 25
    fifty = 50
    one_hundred = 100
    five_hundred = 500
    one_thousand = 1000


class Table(SelectorModel, NamedModel, ParentModel):
    """
    Tables enable you to quickly represent insight data in a tabular format.

    Tables auto-generate columns from insight query results. To customize column headers,
    use SQL aliases in your insight query (e.g., `SELECT revenue AS "Total Revenue"`).

    ### Example
    ``` yaml
    insights:
      - name: monthly-revenue
        props:
          x: ?{ month AS "Month" }
          y: ?{ sum(revenue) AS "Total Revenue" }
        model: ref(revenue-model)

    tables:
      - name: revenue-table
        insight: ref(monthly-revenue)
        rows_per_page: 100
    ```

    Tables are built on the [material react table framework](https://www.material-react-table.com/).
    """

    # NEW: Singular insight (preferred)
    insight: Optional[InsightRef] = Field(
        None,
        description="A ref() to an insight. Data and columns auto-generated from insight query results.",
    )

    # DEPRECATED: Mark for removal in v2.0.0
    insights: List[InsightRef] = Field(
        [],
        description="DEPRECATED: Use singular 'insight' instead. Will be removed in v2.0.0.",
    )
    traces: List[TraceRef] = Field(
        [],
        description="DEPRECATED: Use 'insight' instead. Will be removed in v2.0.0.",
    )
    column_defs: Optional[List[TableColumnDefinition]] = Field(
        None,
        description="DEPRECATED: Columns auto-generated from insight. Will be removed in v2.0.0.",
    )

    rows_per_page: RowsPerPageEnum = Field(
        RowsPerPageEnum.fifty, description="The number of rows to show per page. Default is 50 rows"
    )

    @model_validator(mode="before")
    @classmethod
    def handle_deprecated_fields(cls, data: Any) -> Any:
        """Auto-convert insights (plural) to insight (singular) and emit warnings."""
        table_name = data.get("name", "unknown")

        # Auto-convert insights→insight (but enforce single insight)
        if "insights" in data and data["insights"]:
            if len(data["insights"]) > 1:
                raise ValueError(
                    f"Table '{table_name}' has multiple insights. "
                    "Tables support only one insight. Use 'insight: ref(name)'."
                )
            if not data.get("insight"):
                data["insight"] = data["insights"][0]
                warnings.warn(
                    f"Table '{table_name}': Use 'insight: {data['insight']}' instead of 'insights'. "
                    "Run 'visivo migrate' to auto-fix.",
                    DeprecationWarning,
                    stacklevel=2,
                )

        # Warn about traces
        if "traces" in data and data["traces"]:
            warnings.warn(
                f"Table '{table_name}': 'traces' field deprecated. Convert to insights. "
                "Will be removed in v2.0.0.",
                DeprecationWarning,
                stacklevel=2,
            )

        # Warn about column_defs
        if "column_defs" in data:
            warnings.warn(
                f"Table '{table_name}': 'column_defs' deprecated. Columns auto-generated from insight. "
                "Will be removed in v2.0.0.",
                DeprecationWarning,
                stacklevel=2,
            )

        return data

    @model_validator(mode="after")
    def validate_has_data_source(self):
        """Ensure table has a data source (unless it's legacy with only column_defs)."""
        # Allow legacy tables with only column_defs or empty lists (backward compat)
        # These were used in old test projects
        has_data_source = (
            self.insight
            or (self.insights and len(self.insights) > 0)
            or (self.traces and len(self.traces) > 0)
        )
        has_legacy_config = self.column_defs is not None or self.selector is not None

        if not has_data_source and not has_legacy_config:
            raise ValueError(
                f"Table '{self.name}' must have an 'insight' field. "
                f"Deprecated: 'traces' or 'insights' (plural) also accepted."
            )
        return self

    @model_validator(mode="before")
    @classmethod
    def validate_column_defs_references(cls, data: Any) -> Any:
        """Validate that column_defs reference existing traces/insights (backward compat)."""
        traces = data.get("traces")
        insights = data.get("insights")
        insight = data.get("insight")
        column_defs = data.get("column_defs")

        if not column_defs:
            return data

        trace_names = list(map(lambda t: NamedModel.get_name(t), traces or []))
        insight_names = list(map(lambda i: NamedModel.get_name(i), insights or []))

        # Also include singular insight if present
        if insight:
            singular_name = NamedModel.get_name(insight)
            if singular_name not in insight_names:
                insight_names.append(singular_name)

        for cd in column_defs:
            if "trace_name" in cd and cd["trace_name"] not in trace_names:
                raise ValueError(
                    f"Column def trace name '{cd['trace_name']}' is not present in trace list on table."
                )
            if "insight_name" in cd and cd["insight_name"] not in insight_names:
                raise ValueError(
                    f"Column def insight name '{cd['insight_name']}' is not present in insight list on table."
                )

        return data

    def child_items(self):
        """Return child items for DAG construction."""
        items = []

        # New singular insight takes precedence
        if self.insight:
            items.append(self.insight)
        # Backward compat for deprecated plural insights
        elif self.insights:
            items.extend(self.insights)

        # Backward compat for deprecated traces
        if self.traces:
            items.extend(self.traces)

        if self.selector:
            items.append(self.selector)

        return items
