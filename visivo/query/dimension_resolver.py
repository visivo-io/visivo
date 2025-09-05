"""
DimensionResolver handles dimension resolution across models using the ProjectDag.

This module provides functionality to:
1. Leverage the ProjectDag for dimension discovery
2. Resolve dimension references across models
3. Support both explicit and implicit dimensions
"""

from typing import Dict, List, Optional, Set
from visivo.models.dimension import Dimension
from visivo.models.models.model import Model
from visivo.models.project import Project
from visivo.models.base.project_dag import ProjectDag
from visivo.logger.logger import Logger
import re


class DimensionNotFoundError(Exception):
    """Raised when a referenced dimension cannot be found."""

    pass


class DimensionResolver:
    """
    Resolves dimension references across models by leveraging the ProjectDag.

    This class uses the existing ProjectDag to understand model relationships
    and resolve dimension references to their actual SQL expressions.
    """

    def __init__(self, project: Project):
        """
        Initialize the DimensionResolver with a project.

        Args:
            project: The project with all models and dimensions
        """
        self.project = project
        self.dag: ProjectDag = project.dag()
        self._dimension_cache: Dict[str, str] = {}
        self._build_dimension_index()

    def _build_dimension_index(self):
        """Build an index of all dimensions in the project."""
        self.dimensions_by_name = {}

        # Get all models from the DAG
        from visivo.models.dag import all_descendants_of_type

        all_models = all_descendants_of_type(type=Model, dag=self.dag)

        for model in all_models:
            # First add implicit dimensions (lower priority)
            if hasattr(model, "_implicit_dimensions") and model._implicit_dimensions:
                for dimension in model._implicit_dimensions:
                    # Add by simple name (for current model context)
                    self.dimensions_by_name[dimension.name] = (model, dimension)

                    # Add with model qualifier for cross-model access
                    qualified_name = f"{model.name}.{dimension.name}"
                    self.dimensions_by_name[qualified_name] = (model, dimension)

            # Then add explicit model dimensions (higher priority - overwrites implicit)
            if hasattr(model, "dimensions") and model.dimensions:
                for dimension in model.dimensions:
                    # Add by simple name (for current model context)
                    self.dimensions_by_name[dimension.name] = (model, dimension)

                    # Add with model qualifier for cross-model access
                    qualified_name = f"{model.name}.{dimension.name}"
                    self.dimensions_by_name[qualified_name] = (model, dimension)

        # Finally add project-level dimensions (highest priority)
        if hasattr(self.project, "dimensions") and self.project.dimensions:
            for dimension in self.project.dimensions:
                # Project-level dimensions don't have a specific model
                # They can reference dimensions from multiple models
                self.dimensions_by_name[dimension.name] = (None, dimension)

    def find_dimension(self, name: str) -> Optional[tuple]:
        """
        Find a dimension by name in the project's DAG.

        Args:
            name: Dimension name (can be simple or model-qualified)

        Returns:
            Tuple of (model, dimension) if found, None otherwise
        """
        return self.dimensions_by_name.get(name)

    def resolve_dimension_expression(
        self, dimension_name: str, current_model: Optional[str] = None
    ) -> str:
        """
        Resolve a dimension reference to its SQL expression.

        Args:
            dimension_name: The dimension name (simple or qualified)
            current_model: The current model context (optional)

        Returns:
            The SQL expression for the dimension

        Raises:
            DimensionNotFoundError: If the dimension cannot be found
        """
        # Check cache first
        cache_key = f"{current_model}.{dimension_name}" if current_model else dimension_name
        if cache_key in self._dimension_cache:
            return self._dimension_cache[cache_key]

        # Try to find the dimension
        result = self.find_dimension(dimension_name)

        # If not found and we have a current model context, try with model qualifier
        if not result and current_model:
            qualified_name = f"{current_model}.{dimension_name}"
            result = self.find_dimension(qualified_name)

        if not result:
            raise DimensionNotFoundError(f"Dimension '{dimension_name}' not found in project")

        model, dimension = result

        # Get the dimension expression
        expression = dimension.expression if dimension.expression else dimension.name

        # For project-level dimensions, resolve any nested dimension references
        if model is None:  # Project-level dimension
            expression = self._resolve_nested_dimension_references(expression)

        # Cache the result
        self._dimension_cache[cache_key] = expression

        return expression

    def _resolve_nested_dimension_references(self, expression: str) -> str:
        """
        Resolve any ${ref(model).dimension} references in a dimension expression.

        Args:
            expression: The dimension expression that may contain references

        Returns:
            The expression with all dimension references resolved
        """
        import re

        # Pattern to match ${ref(model).dimension} or ${ref(dimension)}
        pattern = r"\$\{\s*ref\(\s*([^)]+)\s*\)(?:\.([^}]+))?\s*\}"

        def replace_ref(match):
            first_part = match.group(1).strip().strip("'\"")
            second_part = match.group(2).strip() if match.group(2) else None

            if second_part:
                # ${ref(model).dimension} format
                qualified_name = f"{first_part}.{second_part}"
                try:
                    # Recursively resolve the referenced dimension
                    resolved = self.resolve_dimension_expression(qualified_name)
                    return f"({resolved})"
                except DimensionNotFoundError:
                    # Not a dimension, return as-is
                    return match.group(0)
            else:
                # ${ref(dimension)} format
                try:
                    # Recursively resolve the referenced dimension
                    resolved = self.resolve_dimension_expression(first_part)
                    return f"({resolved})"
                except DimensionNotFoundError:
                    # Not a dimension, return as-is
                    return match.group(0)

        # Replace all dimension references
        return re.sub(pattern, replace_ref, expression)

    def get_models_from_dimension(self, dimension_name: str) -> Set[str]:
        """
        Get the set of models that a dimension references.

        Args:
            dimension_name: The dimension name

        Returns:
            Set of model names referenced by the dimension
        """
        result = self.find_dimension(dimension_name)
        if not result:
            return set()

        model, dimension = result

        models = set()

        # If it's a model-level dimension, it references its own model
        if model is not None:
            models.add(model.name)

        # For project-level dimensions, parse the expression for model references
        if model is None or dimension.expression:
            models.update(self._extract_models_from_expression(dimension.expression))

        return models

    def _extract_models_from_expression(self, expression: str) -> Set[str]:
        """
        Extract model names from dimension and field references in an expression.

        Args:
            expression: The SQL expression that may contain ${ref(model).field} patterns

        Returns:
            Set of model names referenced in the expression
        """
        import re
        from visivo.models.dag import all_descendants_of_type
        from visivo.models.models.model import Model

        models = set()

        # Get all model names from the DAG for validation
        all_models = all_descendants_of_type(type=Model, dag=self.dag)
        model_names = {model.name for model in all_models}

        # Pattern to match ${ref(model).field} or ${ref(model).dimension}
        pattern = r"\$\{\s*ref\(\s*([^)]+)\s*\)\.([^}]+)\s*\}"

        for match in re.finditer(pattern, expression):
            model_name = match.group(1).strip().strip("'\"")
            field_name = match.group(2).strip()

            # If it's a valid model name, add it regardless of whether the field is a dimension
            # This handles both dimension references and direct field references
            if model_name in model_names:
                models.add(model_name)

        return models

    def resolve_dimension_reference(
        self, reference: str, current_model: Optional[str] = None
    ) -> tuple:
        """
        Resolve a dimension reference like ${ref(model).dimension} or ${ref(dimension)}.

        Args:
            reference: The full reference string
            current_model: The current model context

        Returns:
            Tuple of (resolved_expression, referenced_models)
        """
        # Pattern to match ${ref(model).dimension} or ${ref(dimension)}
        pattern = r"\$\{\s*ref\(\s*([^)]+)\s*\)(?:\.([^}]+))?\s*\}"
        match = re.match(pattern, reference)

        if not match:
            return reference, set()

        first_part = match.group(1).strip().strip("'\"")
        second_part = match.group(2).strip() if match.group(2) else None

        referenced_models = set()

        if second_part:
            # Format: ${ref(model).dimension}
            model_name = first_part
            dimension_name = second_part
            qualified_name = f"{model_name}.{dimension_name}"

            try:
                expression = self.resolve_dimension_expression(qualified_name)
                referenced_models.add(model_name)
                return expression, referenced_models
            except DimensionNotFoundError:
                # Not a dimension, return as-is
                return reference, set()
        else:
            # Format: ${ref(dimension)}
            dimension_name = first_part

            try:
                expression = self.resolve_dimension_expression(dimension_name, current_model)
                models = self.get_models_from_dimension(dimension_name)
                return expression, models
            except DimensionNotFoundError:
                # Not a dimension, return as-is
                return reference, set()
