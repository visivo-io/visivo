from typing import Optional, List, Union

from visivo.models.base.base_model import generate_ref_field
from pydantic import ConfigDict, Field, field_validator, model_validator
from visivo.query.schema_aggregator import (
    SchemaAggregator,
)  # We might want to change the name of the SchemaAggregator, it's kinda more of reader/writer class
from visivo.models.base.parent_model import ParentModel
from visivo.models.models.model import Model
from visivo.models.sources.fields import SourceRefField
from visivo.models.sources.source import DefaultSource
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension


class SqlModel(Model, ParentModel):
    """
    SQL Models are queries that return base data from a SQL source. The
    resulting columns are referenced by Insights via `${ref(model).column}`
    field references in their `?{ ... }` slot bindings.

    SQL Models can also carry their slice of the semantic layer: model-scoped
    `metrics` (aggregate calculations) and `dimensions` (row-level calculated
    fields) defined on the model are reusable anywhere the model can be
    referenced.

    !!! example {% raw %}

        === "Select All"

            ``` yaml
            models:
              - name: orders
                source: ref(sql_source)
                sql: select * from orders
            ```

        === "With Metrics & Dimensions"

            ``` yaml
            models:
              - name: orders
                source: ref(sql_source)
                sql: select * from orders
                metrics:
                  - name: total_revenue
                    expression: sum(amount)
                dimensions:
                  - name: order_month
                    expression: date_trunc('month', created_at)
            ```

        === "With a Primary Key"

            ``` yaml
            models:
              - name: orders
                source: ref(sql_source)
                sql: select * from orders
                primary_key: order_id
            ```
    {% endraw %}
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    sql: str = Field(
        None,
        description="The SQL query that returns this model's base data from its source.",
    )

    source: Optional[SourceRefField] = Field(
        None,
        description="A source object defined inline or a ${ ref() } to a source. Override the defaults.source_name",
        alias="target",
    )

    metrics: List[Metric] = Field(
        [], description="A list of model-scoped metrics that aggregate data from this model."
    )

    dimensions: List[Dimension] = Field(
        [], description="A list of computed dimensions (row-level calculations) for this model."
    )

    primary_key: Optional[Union[str, List[str]]] = Field(
        None,
        description="The column, or the list of columns, that has one value per row of this "
        "model. A relation that joins this model on its primary key matches at most one row "
        "of this model, so Visivo knows that the join does not repeat rows of the other model.",
    )

    @field_validator("primary_key")
    @classmethod
    def validate_primary_key(cls, value):
        if value is None:
            return value
        columns = [value] if isinstance(value, str) else value
        if not columns or any(not column.strip() for column in columns):
            raise ValueError("primary_key must name at least one column, and no name can be empty.")
        if len({column.casefold() for column in columns}) != len(columns):
            raise ValueError("primary_key names the same column more than once.")
        return value

    @model_validator(mode="after")
    def set_parent_names_on_nested_objects(self):
        """Set parent names on nested metrics and dimensions, and validate no ref() in expressions."""
        from visivo.query.patterns import has_CONTEXT_STRING_REF_PATTERN

        # Process both metrics and dimensions
        for obj_type, objects in [("metric", self.metrics), ("dimension", self.dimensions)]:
            for obj in objects:
                obj.set_parent_name(self.name)
                # Validate no ref() in nested object expressions
                if has_CONTEXT_STRING_REF_PATTERN(obj.expression):
                    raise ValueError(
                        f"Nested {obj_type} '{obj.name}' in model '{self.name}' cannot use ref() syntax in expression. "
                        f"Nested {obj_type}s can only reference fields from their parent model directly."
                    )

        return self

    def child_items(self):
        children = []
        if self.source:
            children.append(self.source)
        else:
            children.append(DefaultSource())

        return children
