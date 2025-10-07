from typing import Optional, List

from visivo.models.base.base_model import generate_ref_field
from pydantic import ConfigDict, Field, model_validator
from visivo.models.base.parent_model import ParentModel
from visivo.models.models.model import Model
from visivo.models.sources.fields import SourceRefField
from visivo.models.sources.source import DefaultSource
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension


class SqlModel(Model, ParentModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    """
    SQL Models are queries that return base data from a SQL source. These data are then used in Traces

    !!! example {% raw %}

        === "Select All"

            ``` yaml
            models:
              - name: sql_model
                source: ref(sql_source)
                sql: select * from table_in_source
            ```
    {% endraw %}
    """

    sql: str = Field(
        None,
        description="The sql used to generate your base data",
    )

    source: Optional[SourceRefField] = Field(
        None,
        description="A source object defined inline or a ref() to a chart. Override the defaults.source_name",
        alias="target",
    )

    metrics: List[Metric] = Field(
        [], description="A list of model-scoped metrics that aggregate data from this model."
    )

    dimensions: List[Dimension] = Field(
        [], description="A list of computed dimensions (row-level calculations) for this model."
    )

    @model_validator(mode="after")
    def set_parent_names_on_nested_objects(self):
        """Set parent names on nested metrics and dimensions, and validate no ref() in expressions."""
        from visivo.query.patterns import has_CONTEXT_STRING_REF_PATTERN

        # Set parent names on nested metrics
        for metric in self.metrics:
            metric.set_parent_name(self.name)
            # Validate no ref() in nested metric expressions
            if has_CONTEXT_STRING_REF_PATTERN(metric.expression):
                raise ValueError(
                    f"Nested metric '{metric.name}' in model '{self.name}' cannot use ref() syntax in expression. "
                    f"Nested metrics can only reference fields from their parent model directly."
                )

        # Set parent names on nested dimensions
        for dimension in self.dimensions:
            dimension.set_parent_name(self.name)
            # Validate no ref() in nested dimension expressions
            if has_CONTEXT_STRING_REF_PATTERN(dimension.expression):
                raise ValueError(
                    f"Nested dimension '{dimension.name}' in model '{self.name}' cannot use ref() syntax in expression. "
                    f"Nested dimensions can only reference fields from their parent model directly."
                )

        return self

    def child_items(self):
        children = []
        if self.source:
            children.append(self.source)
        else:
            children.append(DefaultSource())

        return children
