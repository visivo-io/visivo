"""What the loop sees, whichever provider answered.

Two providers describe the same turn in different shapes: Anthropic returns
content blocks with `stop_reason`, Gemini returns candidate parts with
`finishReason`. The loop cares about neither — it wants to know whether the
model asked for tools and, if not, what it said. Normalising here is what lets
`loop.py` contain no provider name at all.
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass(frozen=True)
class ToolCall:
    """One requested call. ``id`` is the provider's handle for matching the
    result back to the request — Anthropic requires it, Gemini matches on name,
    so it is carried for both and ignored by the one that does not need it."""

    id: str
    name: str
    arguments: Dict[str, Any]


@dataclass(frozen=True)
class Reply:
    """A single assistant turn.

    ``tool_calls`` being empty is how the loop knows the model is done asking
    for things — it is the stopping condition, not `stop_reason`, because the
    two providers spell that differently and a model that returns text plus no
    tools has finished either way.
    """

    text: str = ""
    tool_calls: List[ToolCall] = field(default_factory=list)
    raw: Dict[str, Any] = field(default_factory=dict)

    @property
    def wants_tools(self):
        return bool(self.tool_calls)
