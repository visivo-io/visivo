"""Main project validator that orchestrates all validation."""

from visivo.models.validators.base_validator import BaseProjectValidator
from visivo.models.validators.cli_version_validator import CliVersionValidator
from visivo.models.validators.default_names_validator import DefaultNamesValidator
from visivo.models.validators.models_have_sources_validator import ModelsHaveSourcesValidator
from visivo.models.validators.dag_validator import DagValidator
from visivo.models.validators.project_root_node_validator import ProjectRootNodeValidator
from visivo.models.validators.names_validator import NamesValidator
from visivo.models.validators.metric_references_validator import MetricReferencesValidator
from visivo.models.validators.dimension_references_validator import DimensionReferencesValidator
from visivo.models.validators.relation_references_validator import RelationReferencesValidator
from visivo.models.validators.single_source_validator import SingleSourceValidator
from typing import TYPE_CHECKING, List

if TYPE_CHECKING:
    from visivo.models.project import Project


class ProjectValidator:
    """
    Main validator that orchestrates all project validations.

    This class runs all validators in the correct order to ensure the project
    is valid. Validators are organized as individual classes to make them
    easier to find, maintain, and test.
    """

    def __init__(self):
        """Initialize the project validator with all validators in order."""
        self.validators: List[BaseProjectValidator] = [
            CliVersionValidator(),
            DefaultNamesValidator(),
            ModelsHaveSourcesValidator(),
            DagValidator(),
            ProjectRootNodeValidator(),
            NamesValidator(),
            # Semantic layer validators - must run after DAG validator
            MetricReferencesValidator(),
            DimensionReferencesValidator(),
            RelationReferencesValidator(),
            SingleSourceValidator(),
        ]

    def validate(self, project: "Project") -> "Project":
        """
        Run all validators on the project.

        Args:
            project: The project to validate

        Returns:
            The validated project

        Raises:
            ValueError: If any validation fails
            ClickException: If CLI version validation fails
        """
        for validator in self.validators:
            project = validator.validate(project)
        return project
