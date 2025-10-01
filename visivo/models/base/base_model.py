from pydantic import (
    Field,
    StringConstraints,
    Discriminator,
    Tag,
    BaseModel as PydanticBaseModel,
    ConfigDict,
)
from typing_extensions import Annotated
from typing import Optional, Union, NewType
import re
from visivo.models.base.context_string import ContextString
from visivo.query.patterns import (
    REF_REGEX,
    CONTEXT_STRING_VALUE_REGEX,
)

RefStringType = NewType(
    "RefStringType",
    Annotated[Annotated[str, StringConstraints(pattern=REF_REGEX)], Tag("Ref")],
)

ContextStringType = NewType(
    "ContextStringType",
    Annotated[ContextString, Tag("Context")],
)


def generate_ref_field(class_to_discriminate):
    return NewType(
        class_to_discriminate.__name__,
        Annotated[
            Union[
                RefStringType,
                ContextStringType,
                Annotated[class_to_discriminate, Tag(class_to_discriminate.__name__)],
            ],
            Discriminator(ModelStrDiscriminator(class_to_discriminate)),
        ],
    )


class ModelStrDiscriminator:
    def __init__(self, class_to_discriminate):
        self.class_name = class_to_discriminate.__name__

    def __name__(self):
        return self.class_name

    def __call__(self, value):
        if isinstance(value, str) and re.search(CONTEXT_STRING_VALUE_REGEX, value):
            return "Context"
        elif isinstance(value, str):
            return "Ref"
        elif isinstance(value, (dict, BaseModel)):
            return self.class_name
        else:
            return None


class TraceOrInsightDiscriminator:
    """
    Discriminator for union types that can be either Trace or Insight objects.
    """

    def __name__(self):
        return "TraceOrInsightDiscriminator"

    def __call__(self, value):
        if isinstance(value, str) and re.search(CONTEXT_STRING_VALUE_REGEX, value):
            return "Context"
        elif isinstance(value, str):
            return "Ref"
        elif isinstance(value, dict):
            # Check if this looks like an insight (has interactions field) or trace
            if "interactions" in value:
                return "Insight"
            else:
                return "Trace"
        elif hasattr(value, "__class__"):
            class_name = value.__class__.__name__
            if class_name == "Insight":
                return "Insight"
            elif class_name == "Trace":
                return "Trace"
            else:
                return None
        else:
            return None


class BaseModel(PydanticBaseModel):
    model_config = ConfigDict(extra="forbid")

    path: Optional[str] = Field(None, description="A unique path to this object")

    def id(self):
        return self.path

    def id(self):
        if self.path:
            return self.path

        return self.path

    @classmethod
    def is_obj(cls, obj) -> bool:
        return not cls.is_ref(obj)

    @classmethod
    def is_ref(cls, obj) -> bool:
        return (
            isinstance(obj, str) and re.search(REF_REGEX, obj)
        ) or ContextString.is_context_string(obj)

    def __hash__(self):
        return hash(self.__str__())

    def __str__(self):
        if self.id() is None:
            return self.__class__.__name__
        return self.id()
