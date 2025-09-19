"""
RelationResolver handles resolution of context strings in relation conditions.

This module resolves ${ref(model).field} patterns in relation conditions to
actual SQL references that can be used by the query builder.
"""

from typing import Dict, Optional, Set
from visivo.query.patterns import replace_refs, extract_model_names, validate_ref_syntax
from visivo.logger.logger import Logger


class RelationResolver:
    """
    Resolves context strings in relation conditions to SQL references.

    This class handles the transformation of relation conditions from their
    declarative form (with ${ref(model).field} patterns) to resolved SQL
    that can be used directly by the query builder.
    """

    def __init__(self, model_alias_map: Optional[Dict[str, str]] = None):
        """
        Initialize the RelationResolver.

        Args:
            model_alias_map: Optional mapping of model names to their SQL aliases.
                           If not provided, model names are used as-is.
        """
        self.model_alias_map = model_alias_map or {}
        self.logger = Logger.instance()

    def resolve_condition(self, condition: str, suffix: str = "_cte") -> str:
        """
        Resolve context strings in a relation condition.

        Transforms ${ref(model).field} patterns to model_alias.field SQL references.

        Args:
            condition: The raw condition string with context references
            suffix: Suffix to add to model aliases (default: "_cte")

        Returns:
            Resolved SQL condition string

        Example:
            Input: "${ref('orders').user_id} = ${ref('users').id}"
            Output: "orders_cte.user_id = users_cte.id"
        """

        def replacer(model_name: str, field_name: Optional[str]) -> str:
            # Get the SQL alias for this model
            model_alias = self.model_alias_map.get(model_name, model_name)

            # Return the qualified SQL reference
            if field_name:
                return f"{model_alias}{suffix}.{field_name}"
            else:
                return f"{model_alias}{suffix}"

        # Use shared pattern utility for replacement
        resolved = replace_refs(condition, replacer)

        # Log the resolution for debugging
        if condition != resolved:
            self.logger.debug(f"Resolved relation condition: '{condition}' -> '{resolved}'")

        return resolved

    def extract_referenced_models(self, condition: str) -> Set[str]:
        """
        Extract model names referenced in a condition.

        This method is provided for backward compatibility with tests.
        Production code should use visivo.query.patterns.extract_model_names directly
        or the Relation.get_referenced_models() method.

        Args:
            condition: The condition string with ${ref(model)} patterns

        Returns:
            Set of model names found in the condition
        """
        return extract_model_names(condition)

    def validate_condition(self, condition: str) -> bool:
        """
        Validate that a condition has valid ref syntax and references at least 2 models.

        This method is provided for backward compatibility with tests.
        Production code should rely on Relation model validation.

        Args:
            condition: The condition string to validate

        Returns:
            True if condition is valid, False otherwise
        """
        # Check syntax validity
        is_valid, _ = validate_ref_syntax(condition)
        if not is_valid:
            return False

        # Check that at least 2 models are referenced
        models = extract_model_names(condition)
        return len(models) >= 2
