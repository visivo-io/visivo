"""The two types every tool module shares, kept out of the registry so tool
modules can import them without importing the registry that imports them."""

from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional


@dataclass(frozen=True)
class Annotations:
    """What a client may assume about a tool before it calls it.

    ``open_world`` is true for a tool whose result carries rows or metadata
    read from a data source, which is outside the project.
    """

    title: str
    read_only: bool
    destructive: bool
    open_world: bool = False

    def __post_init__(self):
        if self.read_only and self.destructive:
            raise ValueError(f"'{self.title}' cannot be both read-only and destructive.")

    def as_mcp(self):
        return {
            "title": self.title,
            "readOnlyHint": self.read_only,
            "destructiveHint": self.destructive,
            "openWorldHint": self.open_world,
        }


def reads(title, open_world=False):
    return Annotations(title=title, read_only=True, destructive=False, open_world=open_world)


def writes(title, destructive, open_world=False):
    return Annotations(title=title, read_only=False, destructive=destructive, open_world=open_world)


@dataclass(frozen=True)
class Tool:
    """A callable an agent may invoke: ``handler(flask_app, arguments)``."""

    name: str
    description: str
    input_schema: Dict[str, Any]
    handler: Callable[[Any, Dict[str, Any]], Any]
    annotations: Optional[Annotations] = None


class ToolError(Exception):
    """A refusal with a reason the agent can act on, as opposed to a crash."""
