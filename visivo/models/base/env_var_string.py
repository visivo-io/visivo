"""
Environment variable string type for runtime resolution.

Provides a string type that preserves ${env.VAR_NAME} syntax through parsing
and resolves to actual environment variable values at runtime.
"""

import os
import re
from typing import Any, List

from visivo.query.patterns import ENV_VAR_CONTEXT_PATTERN
from visivo.parsers.env_var_resolver import MissingEnvVarError


# Compiled pattern for performance
_ENV_VAR_PATTERN_COMPILED = re.compile(ENV_VAR_CONTEXT_PATTERN)


class EnvVarString:
    """
    Deferred environment variable resolution.

    Stores ${env.VAR} syntax as-is and resolves on demand when resolve() is called.
    Supports embedded env vars like "prefix-${env.REGION}-suffix".
    """

    def __init__(self, value: str):
        self.value = value

    def __str__(self) -> str:
        return self.value

    def __repr__(self) -> str:
        return f"EnvVarString({self.value!r})"

    def __eq__(self, other) -> bool:
        if isinstance(other, EnvVarString):
            return self.value == other.value
        return False

    def __hash__(self) -> int:
        return hash(self.value)

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
        return _ENV_VAR_PATTERN_COMPILED.findall(self.value)

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

        return _ENV_VAR_PATTERN_COMPILED.sub(replace_env_var, self.value)

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
        if isinstance(value, cls):
            return True
        if isinstance(value, str):
            return bool(_ENV_VAR_PATTERN_COMPILED.search(value))
        return False

    @classmethod
    def __get_pydantic_core_schema__(cls, _source_type: Any, handler: Any):
        """Pydantic v2 schema definition for EnvVarString type."""
        from pydantic_core import core_schema

        def validate_and_create(value: Any) -> "EnvVarString":
            if isinstance(value, cls):
                return value
            str_value = str(value)
            if not _ENV_VAR_PATTERN_COMPILED.search(str_value):
                raise ValueError(
                    f"EnvVarString must contain ${{env.VAR}} pattern, got: {str_value}"
                )
            return cls(str_value)

        return core_schema.no_info_after_validator_function(
            validate_and_create,
            core_schema.str_schema(),
            serialization=core_schema.plain_serializer_function_ser_schema(str),
        )
