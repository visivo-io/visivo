"""Base class for pattern-based string types."""

from abc import ABC
from typing import Any, Pattern
import re


class PatternString(ABC):
    """
    Abstract base class for strings that match a specific pattern.

    Subclasses must define:
    - PATTERN: Compiled regex pattern to match
    - PATTERN_NAME: Human-readable name (e.g., "environment variable")
    - PATTERN_EXAMPLE: Example syntax (e.g., "${env.VAR}")
    """

    PATTERN: Pattern[str] = None
    PATTERN_NAME: str = ""
    PATTERN_EXAMPLE: str = ""

    def __init__(self, value: str):
        self.value = value

    def __str__(self) -> str:
        return self.value

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}({self.value!r})"

    def __eq__(self, other) -> bool:
        if isinstance(other, self.__class__):
            return self.value == other.value
        return False

    def __hash__(self) -> int:
        return hash(self.value)

    @classmethod
    def contains_pattern(cls, value: Any) -> bool:
        """Check if a value contains this class's pattern."""
        if isinstance(value, cls):
            return True
        if isinstance(value, str) and cls.PATTERN:
            return bool(cls.PATTERN.search(value))
        return False

    @classmethod
    def __get_pydantic_core_schema__(cls, _source_type: Any, handler: Any):
        """Pydantic v2 schema with pattern-based validation."""
        from pydantic_core import core_schema

        def validate_and_create(value: Any) -> "PatternString":
            if isinstance(value, cls):
                return value
            str_value = str(value)
            if cls.PATTERN and not cls.PATTERN.search(str_value):
                raise ValueError(
                    f"{cls.__name__} must contain {cls.PATTERN_EXAMPLE} pattern, got: {str_value}"
                )
            return cls(str_value)

        return core_schema.no_info_after_validator_function(
            validate_and_create,
            core_schema.str_schema(),
            serialization=core_schema.plain_serializer_function_ser_schema(str),
        )
