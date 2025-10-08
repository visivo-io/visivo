"""Validator for metric references."""

from typing import TYPE_CHECKING
from visivo.models.validators.base_validator import BaseProjectValidator
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from visivo.models.models.model import Model
from visivo.models.dag import all_descendants_of_type

if TYPE_CHECKING:
    from visivo.models.project import Project


class MetricReferencesValidator(BaseProjectValidator):
    """
    Validates that metrics only reference valid types.

    Rule: Metrics can only reference other metrics, dimensions, or models.
    """

    def validate(self, project: "Project") -> "Project":
        """
        Validate that metrics only reference metrics, dimensions, or models.

        Args:
            project: The project to validate

        Returns:
            The validated project

        Raises:
            ValueError: If a metric references an invalid type
        """
        dag = project.dag()
        all_metrics = all_descendants_of_type(type=Metric, dag=dag)

        for metric in all_metrics:
            self._validate_metric_references(metric, dag)

        return project

    def _validate_metric_references(self, metric: Metric, dag):
        """Validate that a metric only references metrics, dimensions, or models."""
        # Get all successors (what this metric depends on)
        for successor in dag.successors(metric):
            if not isinstance(successor, (Metric, Dimension, Model)):
                raise ValueError(
                    f"Metric '{metric.name}' has an invalid reference to "
                    f"{successor.__class__.__name__} '{getattr(successor, 'name', 'unnamed')}'. "
                    f"Metrics can only reference other metrics, dimensions, or models."
                )
