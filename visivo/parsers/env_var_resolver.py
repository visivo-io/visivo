"""
Environment variable resolver for context strings.

Provides functionality to resolve ${env.VAR_NAME} patterns in YAML content
by replacing them with actual environment variable values.
"""

import os
import re
from typing import Set

from visivo.query.patterns import ENV_VAR_CONTEXT_PATTERN


class MissingEnvVarError(Exception):
    """Raised when a referenced environment variable is not set."""

    def __init__(self, var_name: str, context: str = None):
        self.var_name = var_name
        self.context = context
        message = f"Environment variable '{var_name}' is not set"
        if context:
            message += f" (referenced in {context})"
        super().__init__(message)


# Compiled pattern for performance
_ENV_VAR_PATTERN_COMPILED = re.compile(ENV_VAR_CONTEXT_PATTERN)


def extract_env_var_refs(content: str) -> Set[str]:
    """
    Extract all ${env.VAR_NAME} references from content.

    Args:
        content: String containing potential env var references

    Returns:
        Set of environment variable names referenced

    Example:
        >>> extract_env_var_refs("host: ${env.DB_HOST}, password: ${env.DB_PASSWORD}")
        {'DB_HOST', 'DB_PASSWORD'}
    """
    return set(_ENV_VAR_PATTERN_COMPILED.findall(content))


def resolve_env_vars(content: str, context: str = None) -> str:
    """
    Resolve all ${env.VAR_NAME} references in content.

    Args:
        content: String containing potential env var references
        context: Optional context for error messages (e.g., file path)

    Returns:
        Content with all env var references replaced by their values

    Raises:
        MissingEnvVarError: If a referenced env var is not set

    Example:
        >>> import os
        >>> os.environ['DB_HOST'] = 'localhost'
        >>> resolve_env_vars("host: ${env.DB_HOST}")
        'host: localhost'
    """

    def replace_env_var(match: re.Match) -> str:
        var_name = match.group(1)
        value = os.environ.get(var_name)
        if value is None:
            raise MissingEnvVarError(var_name, context)
        return value

    return _ENV_VAR_PATTERN_COMPILED.sub(replace_env_var, content)


def has_env_var_refs(content: str) -> bool:
    """
    Check if content contains any ${env.VAR_NAME} references.

    Args:
        content: String to check

    Returns:
        True if content contains env var references
    """
    if not content:
        return False
    return bool(_ENV_VAR_PATTERN_COMPILED.search(content))
