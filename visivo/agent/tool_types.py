"""The two types every tool module shares, kept out of the registry so tool
modules can import them without importing the registry that imports them."""

from dataclasses import dataclass
from typing import Any, Callable, Dict


@dataclass(frozen=True)
class Tool:
    """A callable an agent may invoke: ``handler(flask_app, arguments)``."""

    name: str
    description: str
    input_schema: Dict[str, Any]
    handler: Callable[[Any, Dict[str, Any]], Any]


class ToolError(Exception):
    """A refusal with a reason the agent can act on, as opposed to a crash."""
