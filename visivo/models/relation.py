from typing import Optional, Literal
from pydantic import Field, ConfigDict
from visivo.models.base.named_model import NamedModel


class Relation(NamedModel):
    """
    A Relation defines how two models can be joined together.

    Relations enable cross-model analysis by declaring the join conditions between models.
    This allows metrics to combine data from multiple models and enables the system to
    automatically generate the necessary SQL JOINs.

    !!! example
        ```yaml
        relations:
          - name: orders_to_users
            left_model: orders
            right_model: users
            join_type: inner
            condition: "${ref(orders).user_id} = ${ref(users).id}"
            is_default: true
        ```
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    left_model: str = Field(..., description="Name of the first model in the join relationship.")

    right_model: str = Field(..., description="Name of the second model in the join relationship.")

    join_type: Literal["inner", "left", "right", "full"] = Field(
        "inner", description="Type of SQL join to use when connecting the models."
    )

    condition: str = Field(
        ...,
        description="SQL condition for joining the models. Use ${ref(model).field} syntax to reference fields. "
        "Example: '${ref(orders).user_id} = ${ref(users).id}'",
    )

    is_default: Optional[bool] = Field(
        False,
        description="Whether this is the default relation to use when joining these two models. "
        "Useful when multiple relations exist between the same pair of models.",
    )
