"""Handing an image back to the model (VIS-1482).

The agent is about to grow tools that produce pictures — a dashboard
screenshot first. The question these tests answer is the one the whole idea
rests on: does an image a tool produces actually reach the model's eyes, or
does it arrive as a base64 string the model can only talk about?

The answer depends on `ToolReturn.content` being rendered as a separate
`UserPromptPart`, so that is what is asserted — the shape the model is handed,
not the shape the tool returned.
"""

import pytest
from pydantic_ai.messages import (
    BinaryContent,
    ModelResponse,
    TextPart,
    ToolCallPart,
    ToolReturn,
    UserPromptPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel

from visivo.agent import skills
from visivo.agent.actions import attributed_to, log
from visivo.agent.images import image_result, with_extra_return_value
from visivo.agent.loop import build_agent, usage_limits
from visivo.agent.tool_types import Tool
from visivo.agent.tools import TOOLS, call, reset_attachments

# A real 1x1 PNG. Small enough to inline, and a genuine PNG rather than
# arbitrary bytes, because `BinaryContent` is what a provider will be asked to
# accept and "it is a png" is part of the contract.
ONE_PIXEL_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4"
    "890000000a49444154789c6300010000050001"
    "0d0a2db40000000049454e44ae426082"
)


@pytest.fixture(autouse=True)
def clean_log():
    log().clear()
    reset_attachments()
    yield
    log().clear()
    reset_attachments()


@pytest.fixture
def picture_tool():
    """A tool that answers with an image, registered for one test.

    Registered into the real `TOOLS` rather than faked, because the thing under
    test is the path through `call`, `_with_attached_skills` and `_bind` — all
    of which a hand-rolled tool would bypass.
    """

    def handler(app, arguments):
        return image_result(
            ONE_PIXEL_PNG,
            "Screenshot of the dashboard:",
            dashboard=arguments.get("name"),
            width=1,
            height=1,
        )

    TOOLS["take_picture"] = Tool(
        name="take_picture",
        description="Return a picture of something.",
        input_schema={
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        },
        handler=handler,
    )
    yield "take_picture"
    TOOLS.pop("take_picture", None)


def _calls_then_answers(tool, arguments):
    seen = {"n": 0}

    def respond(messages, info: AgentInfo):
        seen["n"] += 1
        if seen["n"] == 1:
            return ModelResponse(parts=[ToolCallPart(tool, arguments)])
        return ModelResponse(parts=[TextPart("I can see it.")])

    model = FunctionModel(respond)
    model.seen = seen
    return model


def _parts_of(messages, kind):
    return [part for message in messages for part in message.parts if isinstance(part, kind)]


def _returns_in(messages):
    return [
        part.content
        for message in messages
        for part in message.parts
        if type(part).__name__ == "ToolReturnPart"
    ]


def _images_in(messages):
    found = []
    for part in _parts_of(messages, UserPromptPart):
        content = part.content
        for item in content if isinstance(content, (list, tuple)) else [content]:
            if isinstance(item, BinaryContent):
                found.append(item)
    return found


class TestTheModelIsHandedThePicture:
    def test_the_image_arrives_as_binary_content(self, integration_app, picture_tool):
        """The assertion the feature rests on. A base64 string in a JSON field
        would also "work" — the tool answers, the model says something
        plausible — and the model would never have seen the dashboard."""
        agent = build_agent(integration_app, _calls_then_answers(picture_tool, {"name": "revenue"}))

        result = agent.run_sync("look at the dashboard", usage_limits=usage_limits())

        pictures = _images_in(result.all_messages())
        assert len(pictures) == 1, [type(p).__name__ for p in result.all_messages()]
        assert pictures[0].media_type == "image/png"
        assert pictures[0].data == ONE_PIXEL_PNG

    def test_it_arrives_beside_the_tool_result_not_inside_it(self, integration_app, picture_tool):
        """`content` becomes its own `UserPromptPart`. That is what makes this
        work on the OpenAI-compatible path, where a tool result is a string and
        has nowhere to put an image."""
        agent = build_agent(integration_app, _calls_then_answers(picture_tool, {"name": "revenue"}))

        messages = agent.run_sync("look", usage_limits=usage_limits()).all_messages()

        returns = _returns_in(messages)
        assert returns, "the tool call produced no return part"
        # The facts, and emphatically not the bytes.
        assert returns[0]["dashboard"] == "revenue"
        assert ONE_PIXEL_PNG not in str(returns[0]).encode(errors="ignore")

    def test_the_caption_is_sent_with_it(self, integration_app, picture_tool):
        """A picture that appears with no sentence in front of it reads to the
        model as context it did not ask for."""
        agent = build_agent(integration_app, _calls_then_answers(picture_tool, {"name": "revenue"}))

        messages = agent.run_sync("look", usage_limits=usage_limits()).all_messages()

        captions = [
            item
            for part in _parts_of(messages, UserPromptPart)
            for item in (part.content if isinstance(part.content, (list, tuple)) else [])
            if isinstance(item, str)
        ]
        assert "Screenshot of the dashboard:" in captions


class TestSkillAttachmentDoesNotEatTheImage:
    """`_with_attached_skills` wraps a result as `{"result": ..., "skills_attached": ...}`.
    Doing that to a `ToolReturn` loses the image — and loses it SILENTLY, which
    is the dangerous part: the tool still answers and only the picture goes
    missing.
    """

    def test_the_skills_land_in_the_return_value(self):
        attached = with_extra_return_value(
            image_result(ONE_PIXEL_PNG, "here:", width=1),
            skills_attached=[{"name": "look-at-it", "body": "..."}],
        )

        assert attached.return_value["width"] == 1
        assert attached.return_value["skills_attached"][0]["name"] == "look-at-it"

    def test_the_image_is_still_in_the_content(self):
        attached = with_extra_return_value(
            image_result(ONE_PIXEL_PNG, "here:", width=1), skills_attached=[]
        )

        assert any(isinstance(item, BinaryContent) for item in attached.content)

    def test_a_tool_with_a_skill_attached_still_delivers_the_picture(
        self, integration_app, picture_tool, monkeypatch
    ):
        monkeypatch.setattr(
            skills,
            "attached_to",
            lambda name: (
                [{"name": "look-at-it", "text": "Look at what you built."}]
                if name == "take_picture"
                else []
            ),
        )
        agent = build_agent(integration_app, _calls_then_answers(picture_tool, {"name": "revenue"}))

        # Skills only attach for the built-in loop, which the runner marks with
        # this context. An MCP client asked for resources and got none, and
        # wrapping its result would change a shape it already parses.
        with attributed_to("agent", "session-under-test"):
            messages = agent.run_sync("look", usage_limits=usage_limits()).all_messages()

        assert len(_images_in(messages)) == 1
        assert _returns_in(messages)[0]["skills_attached"][0]["name"] == "look-at-it"


class TestTheRegistryPathIsIntact:
    def test_call_returns_the_tool_return_unflattened(self, integration_app, picture_tool):
        """`call` is where recording and error shaping live, so an image tool
        has to survive it rather than bypassing it."""
        result = call(integration_app, "take_picture", {"name": "revenue"})

        assert isinstance(result, ToolReturn)
        assert result.return_value["dashboard"] == "revenue"

    def test_the_call_is_recorded(self, integration_app, picture_tool):
        call(integration_app, "take_picture", {"name": "revenue"})

        assert [a["tool"] for a in log().since(0)] == ["take_picture"]
        assert log().since(0)[0]["outcome"] == "ok"
