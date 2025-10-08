"""Validator for semantic layer references (metrics, dimensions, relations)."""

from typing import Set, TYPE_CHECKING
from visivo.models.validators.base_validator import BaseProjectValidator
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from visivo.models.relation import Relation
from visivo.models.models.model import Model
from visivo.models.models.sql_model import SqlModel
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.dag import all_descendants_of_type

if TYPE_CHECKING:
    from visivo.models.project import Project


class SemanticLayerValidator(BaseProjectValidator):
    """
    Validates semantic layer object references and dependencies.

    Rules:
    - Metrics can only reference: other metrics, dimensions, or models
    - Dimensions can only reference: other dimensions or models
    - Relations can only reference: models only
    - All metrics must tie back to a single base model (SqlModel, CsvScriptModel, or LocalMergeModel)
    """

    def validate(self, project: "Project") -> "Project":
        """
        Validate semantic layer references and dependencies.

        Args:
            project: The project to validate

        Returns:
            The validated project

        Raises:
            ValueError: If semantic layer validation fails
        """
        dag = project.dag()

        # Get all semantic layer objects
        all_metrics = all_descendants_of_type(type=Metric, dag=dag)
        all_dimensions = all_descendants_of_type(type=Dimension, dag=dag)
        all_relations = all_descendants_of_type(type=Relation, dag=dag)

        # Validate each metric
        for metric in all_metrics:
            self._validate_metric_references(metric, dag, project)
            self._validate_metric_base_model(metric, dag, project)

        # Validate each dimension
        for dimension in all_dimensions:
            self._validate_dimension_references(dimension, dag, project)

        # Validate each relation
        for relation in all_relations:
            self._validate_relation_references(relation, dag, project)

        return project

    def _validate_metric_references(self, metric: Metric, dag, project: "Project"):
        """Validate that a metric only references metrics, dimensions, or models."""
        # Get all successors (what this metric depends on)
        for successor in dag.successors(metric):
            if not isinstance(successor, (Metric, Dimension, Model)):
                raise ValueError(
                    f"Metric '{metric.name}' has an invalid reference to "
                    f"{successor.__class__.__name__} '{getattr(successor, 'name', 'unnamed')}'. "
                    f"Metrics can only reference other metrics, dimensions, or models."
                )

    def _validate_dimension_references(self, dimension: Dimension, dag, project: "Project"):
        """Validate that a dimension only references dimensions or models."""
        # Get all successors (what this dimension depends on)
        for successor in dag.successors(dimension):
            if not isinstance(successor, (Dimension, Model)):
                raise ValueError(
                    f"Dimension '{dimension.name}' has an invalid reference to "
                    f"{successor.__class__.__name__} '{getattr(successor, 'name', 'unnamed')}'. "
                    f"Dimensions can only reference other dimensions or models."
                )

    def _validate_relation_references(self, relation: Relation, dag, project: "Project"):
        """Validate that a relation only references models."""
        # Get all successors (what this relation depends on)
        for successor in dag.successors(relation):
            if not isinstance(successor, Model):
                raise ValueError(
                    f"Relation '{relation.name}' has an invalid reference to "
                    f"{successor.__class__.__name__} '{getattr(successor, 'name', 'unnamed')}'. "
                    f"Relations can only reference models."
                )

    def _validate_metric_base_model(self, metric: Metric, dag, project: "Project"):
        """
        Validate that a metric ties back to a single base model.

        A metric can reference other metrics/dimensions, but when you trace
        all dependencies back, they should all resolve to a single base model
        (SqlModel, CsvScriptModel, or LocalMergeModel).
        """
        base_models = self._get_base_models_for_metric(metric, dag, set())

        if len(base_models) == 0:
            raise ValueError(
                f"Metric '{metric.name}' does not tie back to any base model. "
                f"All metrics must ultimately reference a SqlModel, CsvScriptModel, or LocalMergeModel."
            )

        if len(base_models) > 1:
            model_names = sorted([model.name for model in base_models])
            raise ValueError(
                f"Metric '{metric.name}' ties back to multiple base models: {', '.join(model_names)}. "
                f"All metrics must tie back to a single base model (SqlModel, CsvScriptModel, or LocalMergeModel)."
            )

    def _get_base_models_for_metric(self, metric: Metric, dag, visited: Set[Metric]) -> Set[Model]:
        """
        Recursively find all base models that a metric depends on.

        Args:
            metric: The metric to analyze
            dag: The project DAG
            visited: Set of already visited metrics to prevent infinite loops

        Returns:
            Set of base models this metric ultimately depends on
        """
        if metric in visited:
            return set()

        visited.add(metric)
        base_models = set()

        # Get all successors (dependencies)
        for successor in dag.successors(metric):
            if isinstance(successor, Model):
                # Found a base model
                base_models.add(successor)
            elif isinstance(successor, Metric):
                # Recurse into referenced metric
                base_models.update(self._get_base_models_for_metric(successor, dag, visited))
            elif isinstance(successor, Dimension):
                # Get base models from dimension
                base_models.update(self._get_base_models_for_dimension(successor, dag, set()))

        return base_models

    def _get_base_models_for_dimension(
        self, dimension: Dimension, dag, visited: Set[Dimension]
    ) -> Set[Model]:
        """
        Recursively find all base models that a dimension depends on.

        Args:
            dimension: The dimension to analyze
            dag: The project DAG
            visited: Set of already visited dimensions to prevent infinite loops

        Returns:
            Set of base models this dimension ultimately depends on
        """
        if dimension in visited:
            return set()

        visited.add(dimension)
        base_models = set()

        # Get all successors (dependencies)
        for successor in dag.successors(dimension):
            if isinstance(successor, Model):
                # Found a base model
                base_models.add(successor)
            elif isinstance(successor, Dimension):
                # Recurse into referenced dimension
                base_models.update(self._get_base_models_for_dimension(successor, dag, visited))

        return base_models
