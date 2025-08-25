from typing import Optional, Literal, Set
from pydantic import Field, ConfigDict, field_validator
from visivo.models.base.named_model import NamedModel
import re


class Relation(NamedModel):
    """
    A Relation defines how two models can be joined together.

    Relations enable cross-model analysis by declaring the join conditions between models.
    This allows metrics to combine data from multiple models and enables the system to
    automatically generate the necessary SQL JOINs. The models involved in the relation
    are inferred from the condition.

    !!! example
        ```yaml
        relations:
          - name: orders_to_users
            join_type: inner
            condition: "${ref(orders).user_id} = ${ref(users).id}"
            is_default: true
        ```
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    join_type: Literal["inner", "left", "right", "full"] = Field(
        "inner", description="Type of SQL join to use when connecting the models."
    )

    condition: str = Field(
        ...,
        description="SQL condition for joining the models. Use ${ref(model).field} syntax to reference fields. "
        "Example: '${ref(orders).user_id} = ${ref(users).id}'. Cannot join on metrics (aggregated values).",
    )

    is_default: Optional[bool] = Field(
        False,
        description="Whether this is the default relation to use when joining these two models. "
        "Useful when multiple relations exist between the same pair of models.",
    )

    def get_referenced_models(self) -> Set[str]:
        """
        Extract the model names referenced in the condition.

        Returns:
            Set of model names found in the condition
        """
        models = set()
        # Pattern to match ${ref(model).field} or ${ref(model)}
        pattern = r"\$\{ref\(([^)]+)\)(?:\.([^}]+))?\}"

        for match in re.finditer(pattern, self.condition):
            model_name = match.group(1)
            models.add(model_name)

        return models

    @field_validator("condition")
    @classmethod
    def validate_condition_has_models(cls, v: str) -> str:
        """
        Validate that the condition references at least two models.

        Args:
            v: The condition string

        Returns:
            The validated condition string

        Raises:
            ValueError: If the condition doesn't reference at least two models
        """
        # Pattern to match ${ref(model).field} or ${ref(model)}
        pattern = r"\$\{ref\(([^)]+)\)(?:\.([^}]+))?\}"

        models = set()
        for match in re.finditer(pattern, v):
            model_name = match.group(1)
            models.add(model_name)

        if len(models) < 2:
            raise ValueError(
                f"Relation condition must reference at least two different models. "
                f"Found: {list(models) if models else 'none'}. "
                f"Example: '${{ref(orders).user_id}} = ${{ref(users).id}}'"
            )

        return v
