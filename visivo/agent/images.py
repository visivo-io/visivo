"""Handing an image back to the model (VIS-1482).

A tool returns JSON. An image is not JSON, and the obvious workarounds — a
base64 string in a field, a URL the model cannot open — give the model
something it can talk *about* rather than something it can see. So this is one
helper, used by every tool that produces an image, rather than a pattern each
one gets right separately.

## Why the image travels beside the result, not inside it

``ToolReturn.content`` is sent as a **separate** ``UserPromptPart``, and that is
the whole reason this works on both of our model paths:

- Anthropic, BYO key, accepts image blocks in a tool result natively.
- Visivo-supplied inference is Gemini behind core's ``/api/inference/``, which
  is **OpenAI chat-completions shaped** — and in that protocol a tool result is
  a string. There is nowhere to put an image.

pydantic-ai bridges that by rendering ``content`` as a user message instead:
``OpenAIChatModel._map_binary_content_item`` turns ``BinaryContent`` into an
``image_url`` part carrying a data URI. So ``return_value`` is what the tool
"returned" and ``content`` is what the model looks at, and the second one
arrives whichever provider is answering.

Returning the image *inside* ``return_value`` would also be valid pydantic-ai —
and would silently degrade to a base64 blob in a string on the OpenAI path.
That is the trap this module exists to not fall into.
"""

from pydantic_ai.messages import BinaryContent, ToolReturn

# What `ToolReturn` the model actually sees, so a caller does not have to know
# the shape and a test can assert on it.
IMAGE_MEDIA_TYPE = "image/png"


def image_result(png, caption, **facts):
    """An image for the model, plus ``facts`` for the transcript.

    ``caption`` is a sentence the model reads immediately before the image —
    worth writing properly, because it is the only thing distinguishing "here
    is the dashboard you asked about" from an image that appeared for no
    reason. ``facts`` are JSON-safe values that become the tool's return value:
    dimensions, the object captured, anything a reader of the Agent tab wants
    without the bytes.
    """
    return ToolReturn(
        return_value=dict(facts),
        content=[caption, BinaryContent(png, media_type=IMAGE_MEDIA_TYPE)],
    )


def is_image_result(result):
    return isinstance(result, ToolReturn)


def with_extra_return_value(result, **extra):
    """Add to a ``ToolReturn``'s ``return_value``, leaving its content alone.

    For the callers that wrap a tool's result — skill attachment, principally.
    Wrapping a ``ToolReturn`` in a dict the way they wrap plain results would
    drop the image on the floor, and do it silently: the tool still answers,
    the model just never sees the picture.
    """
    value = result.return_value
    merged = {**value, **extra} if isinstance(value, dict) else {"result": value, **extra}
    return ToolReturn(return_value=merged, content=result.content)
