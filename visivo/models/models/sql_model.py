from typing import Optional

from visivo.models.base.base_model import generate_ref_field
from pydantic import Field
from visivo.models.base.parent_model import ParentModel
from visivo.models.models.model import Model
from visivo.models.targets.fields import TargetRefField
from visivo.models.targets.target import DefaultTarget, Target


class SqlModel(Model, ParentModel):
    """
    SQL Models are queries that return base data from a SQL target. These data are then used in Traces

    !!! example {% raw %}

        === "Select All"

            ``` yaml
            models:
              - name: sql_model
                target: ref(sql_target)
                sql: select * from table_in_target
            ```
    {% endraw %}
    """

    sql: str = Field(
        None,
        description="The sql used to generate your base data",
    )

    target: Optional[TargetRefField] = Field(
        None,
        description="A target object defined inline or a ref() to a chart. Override the defaults.target_name",
    )

    def child_items(self):
        if self.target:
            return [self.target]
        else:
            return [DefaultTarget()]
