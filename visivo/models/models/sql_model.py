from typing import Optional

from visivo.models.base.base_model import generate_ref_field
from pydantic import ConfigDict, Field
from visivo.models.base.parent_model import ParentModel
from visivo.models.models.model import Model
from visivo.models.sources.fields import SourceRefField
from visivo.models.sources.source import DefaultSource


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

    def child_items(self):
        if self.source:
            return [self.source]
        else:
            return [DefaultSource()]
