"""The two types every tool module shares, kept apart from the registry so a
tool module can import them without importing the registry that imports it."""

from dataclasses import dataclass
from typing import Any, Callable, Dict


@dataclass(frozen=True)
class Tool:
    """A callable an agent may invoke.

    ``handler`` takes the Flask app (which owns the managers) and the decoded
    arguments, so the registry itself is a module-level constant with no
    lifecycle of its own — a transport builds no state to serve it.
    """

    name: str
    description: str
    input_schema: Dict[str, Any]
    handler: Callable[[Any, Dict[str, Any]], Any]


class ToolError(Exception):
    """A tool refused, with a reason worth showing the agent.

    Separate from an unexpected exception: this one is part of the contract —
    a name that does not exist, a config that does not validate — and the
    transport turns it into a result the model can act on rather than a crash.
    """
