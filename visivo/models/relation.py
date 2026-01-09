from typing import Optional, Literal, Set
from pydantic import Field, ConfigDict, field_validator
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.query.patterns import extract_ref_names, validate_ref_syntax, count_model_references


class Relation(NamedModel, ParentModel):
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
        return extract_ref_names(self.condition)

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
        # Validate syntax first
        is_valid, error = validate_ref_syntax(v)
        if not is_valid:
            raise ValueError(error)

        # Check we have at least 2 models
        models = extract_ref_names(v)
        if len(models) < 2:
            raise ValueError(
                f"Relation condition must reference at least two different models. "
                f"Found: {list(models) if models else 'none'}. "
                f"Example: '${{ref(orders).user_id}} = ${{ref(users).id}}'"
            )

        return v

    def child_items(self):
        """
        Return child items for DAG construction.

        Extracts model references from the relation condition using ${ref(model).field} syntax.
        This allows the DAG to properly track dependencies between relations and the models they connect.

        Returns:
            List of ref() strings for models referenced in the condition
        """
        children = []

        # Extract all model names from the condition
        if self.condition:
            model_names = extract_ref_names(self.condition)

            # Convert to ref() format for DAG
            for model_name in model_names:
                children.append(f"ref({model_name})")

        return children

    def validate_same_source(self, dag, output_dir: str) -> None:
        """Validate that all models in this relation use the same source.

        Relations between models from different sources are not supported because
        SQL joins require all tables to be accessible from a single database connection.

        Args:
            dag: The project DAG
            output_dir: Output directory for model schemas

        Raises:
            ValueError: If models use different sources
        """
        from visivo.jobs.utils import get_source_for_model

        model_names = list(self.get_referenced_models())
        if len(model_names) != 2:
            return  # Other validation handles this case

        model_a = dag.get_descendant_by_name(model_names[0])
        model_b = dag.get_descendant_by_name(model_names[1])

        source_a = get_source_for_model(model_a, dag, output_dir)
        source_b = get_source_for_model(model_b, dag, output_dir)

        if source_a is None or source_b is None:
            # If sources can't be determined, skip validation
            # Other validation will catch missing source errors
            return

        if source_a.name != source_b.name:
            raise ValueError(
                f"Relation '{self.name}' connects models from different sources.\n\n"
                f"  Model '{model_a.name}' uses source: {source_a.name}\n"
                f"  Model '{model_b.name}' uses source: {source_b.name}\n\n"
                f"Cross-source relations are not currently supported. "
                f"Both models must use the same source."
            )
