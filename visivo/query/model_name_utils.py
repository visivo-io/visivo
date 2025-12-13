"""
Utilities for handling model names in SQL queries.

This module provides functions for sanitizing model names to ensure they are
SQL-compliant identifiers, which is essential when building queries with models
that have spaces or special characters in their names.
"""

import re
from typing import Dict

from visivo.models.base.named_model import alpha_hash


class ModelNameSanitizer:
    """
    Handles sanitization of model names for SQL queries.

    Maintains a cache to ensure consistent sanitization across a session.
    """

    def __init__(self):
        """Initialize with an empty cache."""
        self._cache: Dict[str, str] = {}

    def sanitize(self, model_name: str) -> str:
        """
        Sanitize a model name to be SQL-compliant.

        Args:
            model_name: Original model name that may contain spaces or special characters

        Returns:
            SQL-safe identifier
        """
        # Return from cache if already processed
        if model_name in self._cache:
            return self._cache[model_name]

        # If the name is already SQL-compliant (alphanumeric + underscore), keep it
        if re.match(r"^[a-zA-Z][a-zA-Z0-9_]*$", model_name):
            sanitized = model_name
        else:
            # Otherwise, create a hash-based name
            # Use 7 base26 chars (similar entropy to 8 hex chars)
            # Strip the 'm' prefix since we add our own prefix
            hash_suffix = alpha_hash(model_name, length=7)[1:]

            # Try to preserve some readability by taking first valid chars
            clean_prefix = re.sub(r"[^a-zA-Z0-9]", "", model_name)[:10]
            if not clean_prefix:
                clean_prefix = "model"

            sanitized = f"{clean_prefix}_{hash_suffix}"

        # Cache the result
        self._cache[model_name] = sanitized
        return sanitized

    def get_alias(self, model_name: str, suffix: str = "_cte") -> str:
        """
        Get the SQL alias for a model with an optional suffix.

        Args:
            model_name: Original model name
            suffix: Suffix to append (default: "_cte")

        Returns:
            SQL-safe alias with suffix
        """
        return f"{self.sanitize(model_name)}{suffix}"

    def clear_cache(self):
        """Clear the sanitization cache."""
        self._cache.clear()


# Global instance for consistent sanitization across modules
_global_sanitizer = ModelNameSanitizer()


def sanitize_model_name(model_name: str) -> str:
    """
    Sanitize a model name to be SQL-compliant.

    Uses a global sanitizer instance to ensure consistency.

    Args:
        model_name: Original model name

    Returns:
        SQL-safe identifier
    """
    return _global_sanitizer.sanitize(model_name)


def get_model_alias(model_name: str, suffix: str = "_cte") -> str:
    """
    Get the SQL alias for a model with an optional suffix.

    Args:
        model_name: Original model name
        suffix: Suffix to append (default: "_cte")

    Returns:
        SQL-safe alias with suffix
    """
    return _global_sanitizer.get_alias(model_name, suffix)


def clear_sanitization_cache():
    """Clear the global sanitization cache."""
    _global_sanitizer.clear_cache()
