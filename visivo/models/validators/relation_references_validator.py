"""Validator for relation references."""

from typing import TYPE_CHECKING
from visivo.models.validators.base_validator import BaseProjectValidator
from visivo.models.relation import Relation
from visivo.models.models.model import Model
from visivo.models.dag import all_descendants_of_type

if TYPE_CHECKING:
    from visivo.models.project import Project


class RelationReferencesValidator(BaseProjectValidator):
    """
    Validates that relations only reference valid types.

    Rule: Relations can only reference models.
    """

    def validate(self, project: "Project") -> "Project":
        """
        Validate that relations only reference models.

        Args:
            project: The project to validate

        Returns:
            The validated project

        Raises:
            ValueError: If a relation references an invalid type
        """
        dag = project.dag()
        all_relations = all_descendants_of_type(type=Relation, dag=dag)

        for relation in all_relations:
            self._validate_relation_references(relation, dag)

        return project

    def _validate_relation_references(self, relation: Relation, dag):
        """Validate that a relation only references models."""
        # Get all successors (what this relation depends on)
        for successor in dag.successors(relation):
            if not isinstance(successor, Model):
                raise ValueError(
                    f"Relation '{relation.name}' has an invalid reference to "
                    f"{successor.__class__.__name__} '{getattr(successor, 'name', 'unnamed')}'. "
                    f"Relations can only reference models."
                )
