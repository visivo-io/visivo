"""Validator for a relation's declared cardinality."""

from typing import TYPE_CHECKING

from visivo.models.dag import all_descendants_of_type
from visivo.models.models.model import Model
from visivo.models.relation import Relation
from visivo.models.relation_keys import cardinality_error
from visivo.models.validators.base_validator import BaseProjectValidator

if TYPE_CHECKING:
    from visivo.models.project import Project


class RelationCardinalityValidator(BaseProjectValidator):
    """
    Validates that a relation's cardinality agrees with the declared primary keys.

    Rule: A relation cannot declare a model as the many side when its condition
    joins that model on the model's primary_key.
    """

    def validate(self, project: "Project") -> "Project":
        dag = project.dag()
        models = {model.name: model for model in all_descendants_of_type(type=Model, dag=dag)}
        for relation in all_descendants_of_type(type=Relation, dag=dag):
            error = cardinality_error(relation, models.get)
            if error:
                raise ValueError(error)
        return project
