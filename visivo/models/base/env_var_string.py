"""
Environment variable string type for runtime resolution.

Provides a string type that preserves ${env.VAR_NAME} syntax through parsing
and resolves to actual environment variable values at runtime.
"""

import os
import re
from typing import Any, List

from visivo.models.base.pattern_string import PatternString
from visivo.query.patterns import ENV_VAR_CONTEXT_PATTERN
from visivo.parsers.env_var_resolver import MissingEnvVarError


class EnvVarString(PatternString):
    """
    Deferred environment variable resolution.

    Stores ${env.VAR} syntax as-is and resolves on demand when resolve() is called.
    Supports embedded env vars like "prefix-${env.REGION}-suffix".
    """

    PATTERN = re.compile(ENV_VAR_CONTEXT_PATTERN)
    PATTERN_NAME = "environment variable"
    PATTERN_EXAMPLE = "${env.VAR}"

    def get_env_var_names(self) -> List[str]:
        """
        Extract all environment variable names from the string.

        Returns:
            List of variable names referenced in this string.

        Example:
            >>> evs = EnvVarString("${env.HOST}:${env.PORT}")
            >>> evs.get_env_var_names()
            ['HOST', 'PORT']
        """
        return self.PATTERN.findall(self.value)

    def resolve(self, raise_on_missing: bool = True) -> str:
        """
        Resolve all ${env.VAR} references to actual environment variable values.

        Args:
            raise_on_missing: If True, raises MissingEnvVarError for unset vars.
                              If False, keeps original syntax for unset vars.

        Returns:
            The string with all env var references replaced by their values.

        Raises:
            MissingEnvVarError: If an env var is not set and raise_on_missing=True.

        Example:
            >>> import os
            >>> os.environ['HOST'] = 'localhost'
            >>> evs = EnvVarString("db-${env.HOST}.com")
            >>> evs.resolve()
            'db-localhost.com'
        """

        def replace_env_var(match: re.Match) -> str:
            var_name = match.group(1)
            value = os.environ.get(var_name)
            if value is None:
                if raise_on_missing:
                    raise MissingEnvVarError(var_name)
                return match.group(0)  # Keep original if not raising
            return value

        return self.PATTERN.sub(replace_env_var, self.value)

    def is_fully_set(self) -> bool:
        """
        Check if ALL referenced environment variables are currently set.

        Returns:
            True if all env vars are set, False if any are missing.
        """
        return all(os.environ.get(name) is not None for name in self.get_env_var_names())

    @classmethod
    def contains_env_var(cls, value: Any) -> bool:
        """
        Check if a value contains ${env.VAR} pattern.

        Args:
            value: Any value to check.

        Returns:
            True if value contains env var syntax.
        """
        return cls.contains_pattern(value)
