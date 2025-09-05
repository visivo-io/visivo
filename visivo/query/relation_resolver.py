"""
RelationResolver handles resolution of context strings in relation conditions.

This module resolves ${ref(model).field} patterns in relation conditions to
actual SQL references that can be used by the query builder.
"""

from typing import Dict, Optional, Set
import re
from visivo.models.relation import Relation
from visivo.models.models.model import Model
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
        # Pattern to match ${ref(model).field} or ${ref('model').field}
        # Handles both quoted and unquoted model names
        pattern = r'\$\{\s*ref\((?:[\'"]([^\'\"]+)[\'"]|([^)]+))\)\.([^}]+)\}'
        
        def replace_ref(match):
            # Either group 1 (quoted) or group 2 (unquoted) has the model name
            model_name = (match.group(1) or match.group(2)).strip()
            field_name = match.group(3).strip()
            
            # Get the SQL alias for this model
            if model_name in self.model_alias_map:
                model_alias = self.model_alias_map[model_name]
            else:
                # If no alias mapping, use the model name as-is
                model_alias = model_name
            
            # Return the qualified SQL reference
            return f"{model_alias}{suffix}.{field_name}"
        
        # Replace all context string references
        resolved = re.sub(pattern, replace_ref, condition)
        
        # Log the resolution for debugging
        if condition != resolved:
            self.logger.debug(f"Resolved relation condition: '{condition}' -> '{resolved}'")
        
        return resolved
    
    def extract_referenced_models(self, condition: str) -> Set[str]:
        """
        Extract all model names referenced in a condition.
        
        Args:
            condition: The condition string with context references
            
        Returns:
            Set of model names found in the condition
        """
        models = set()
        
        # Pattern to match ${ref(model).field} or ${ref('model').field}
        pattern = r'\$\{\s*ref\((?:[\'"]([^\'\"]+)[\'"]|([^)]+))\)(?:\.([^}]+))?\}'
        
        for match in re.finditer(pattern, condition):
            # Either group 1 (quoted) or group 2 (unquoted) has the model name
            model_name = (match.group(1) or match.group(2)).strip()
            models.add(model_name)
        
        return models
    
    def validate_condition(self, condition: str) -> bool:
        """
        Validate that a condition has proper context string syntax.
        
        Args:
            condition: The condition string to validate
            
        Returns:
            True if the condition is valid, False otherwise
        """
        # Check for ${ref(...)} patterns
        if '${' in condition and '}' in condition:
            # Ensure all ${ have matching ref() calls
            pattern = r'\$\{[^}]*\}'
            for match in re.finditer(pattern, condition):
                content = match.group(0)
                if 'ref(' not in content:
                    self.logger.debug(f"Invalid context string in condition: {content}")
                    return False
        
        # Ensure we have at least two model references for a valid join
        models = self.extract_referenced_models(condition)
        if '${' in condition and len(models) < 2:
            self.logger.debug(
                f"Relation condition must reference at least 2 models, found {len(models)}: {models}"
            )
            return False
        
        return True