"""Validator for DAG structure and constraints."""

from visivo.models.validators.base_validator import BaseProjectValidator
from visivo.models.dag import all_descendants_of_type
from visivo.models.table import Table
from visivo.models.selector import Selector, SelectorType
from visivo.models.inputs.input import Input
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from visivo.models.project import Project


class DagValidator(BaseProjectValidator):
    """Validates DAG structure and constraints (no cycles, table selector/input types)."""

    def validate(self, project: "Project") -> "Project":
        """
        Validate the project DAG.

        Args:
            project: The project to validate

        Returns:
            The validated project

        Raises:
            ValueError: If DAG validation fails
        """
        dag = project.dag()
        if not dag.validate_dag():
            raise ValueError("Project contains a circular reference.")

        tables = all_descendants_of_type(type=Table, dag=dag, from_node=project)
        for table in tables:
            selectors = all_descendants_of_type(type=Selector, dag=dag, from_node=table)
            if len(selectors) > 0 and selectors[0].type == SelectorType.multiple:
                raise ValueError(
                    f"Table with name '{table.name}' has a selector with a 'multiple' type.  This is not permitted."
                )

            inputs = all_descendants_of_type(type=Input, dag=dag, from_node=table)
            if len(inputs) > 0 and inputs[0].type == SelectorType.multiple:
                raise ValueError(
                    f"Table with name '{table.name}' has an input with a 'multiple' type.  This is not permitted."
                )

        return project
