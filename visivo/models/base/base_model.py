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
from visivo.models.base.context_string import VALUE_REGEX, ContextString

REF_REGEX = r"^ref\(\s*(?P<ref_name>[a-zA-Z0-9\s'\"\-_]+)\)$"
STATEMENT_REGEX = r"^\s*query\(\s*(?P<query_statement>.+)\)\s*$|^\s*column\(\s*(?P<column_name>.+)\)(?:\[(?:-?\d*:-?\d+|-?\d+:-?\d*|:-?\d+|-?\d+:)\])?\s*$"
INDEXED_STATEMENT_REGEX = r"^\s*column\(\s*(?P<column_name>.+)\)\[(-?\d*)\]\s*$"

RefString = NewType(
    "RefString",
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
                RefString,
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
        if isinstance(value, str) and re.search(VALUE_REGEX, value):
            return "Context"
        elif isinstance(value, str):
            return "Ref"
        elif isinstance(value, (dict, BaseModel)):
            return self.class_name
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
        return isinstance(obj, str) and re.search(REF_REGEX, obj)

    def __hash__(self):
        return hash(self.__str__())

    def __str__(self):
        if self.id() is None:
            return self.__class__.__name__
        return self.id()
