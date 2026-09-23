from pydantic import (
    Field,
    StringConstraints,
    Discriminator,
    Tag,
    BaseModel as PydanticBaseModel,
    ConfigDict,
    SecretStr,
)
from pydantic.functional_serializers import PlainSerializer
from typing_extensions import Annotated
from typing import ClassVar, FrozenSet, Optional, Union, NewType
import re
from visivo.models.base.context_string import ContextString
from visivo.models.base.env_var_string import EnvVarString
from visivo.query.patterns import (
    REF_PROPERTY_PATTERN,
    CONTEXT_STRING_VALUE_PATTERN,
    ENV_VAR_CONTEXT_PATTERN,
)


def _serialize_ref_to_context(value: str) -> str:
    # If value is already a ContextString object, return its string representation directly
    # to avoid double-wrapping (ContextString already has the ${ } wrapper)
    from visivo.models.base.context_string import ContextString

    if isinstance(value, ContextString):
        return str(value)

    # If the string value already contains ${ } wrapper, return as-is
    # This prevents double-wrapping when a string like "${ref(name)}" is passed
    if isinstance(value, str) and value.strip().startswith("${") and value.strip().endswith("}"):
        return value

    # For plain ref strings like "ref(name)", wrap with ${ }
    result = f"${{{value}}}"
    return result


RefStringType = NewType(
    "RefStringType",
    Annotated[
        Annotated[
            str,
            StringConstraints(pattern=REF_PROPERTY_PATTERN),
            PlainSerializer(_serialize_ref_to_context),
        ],
        Tag("Ref"),
    ],
)

ContextStringType = NewType(
    "ContextStringType",
    Annotated[ContextString, Tag("Context")],
)

EnvVarStringType = NewType(
    "EnvVarStringType",
    Annotated[EnvVarString, Tag("EnvVar")],
)


class StringOrEnvVarDiscriminator:
    """Discriminates between env var references and literal strings."""

    def __name__(self):
        return "StringOrEnvVarDiscriminator"

    def __call__(self, value):
        if isinstance(value, EnvVarString):
            return "EnvVar"
        if isinstance(value, str) and re.search(ENV_VAR_CONTEXT_PATTERN, value):
            return "EnvVar"
        return "String"


class SecretStrOrEnvVarDiscriminator:
    """Discriminates between env var references and SecretStr values."""

    def __name__(self):
        return "SecretStrOrEnvVarDiscriminator"

    def __call__(self, value):
        if isinstance(value, EnvVarString):
            return "EnvVar"
        if isinstance(value, str) and re.search(ENV_VAR_CONTEXT_PATTERN, value):
            return "EnvVar"
        return "SecretStr"


# Type aliases for source fields that can contain env var references
StringOrEnvVar = Annotated[
    Union[EnvVarStringType, Annotated[str, Tag("String")]],
    Discriminator(StringOrEnvVarDiscriminator()),
]

SecretStrOrEnvVar = Annotated[
    Union[EnvVarStringType, Annotated[SecretStr, Tag("SecretStr")]],
    Discriminator(SecretStrOrEnvVarDiscriminator()),
]


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
        if isinstance(value, str) and re.search(CONTEXT_STRING_VALUE_PATTERN, value):
            return "Context"
        elif isinstance(value, str):
            return "Ref"
        elif isinstance(value, (dict, BaseModel)):
            return self.class_name
        else:
            return None


class BaseModel(PydanticBaseModel):
    model_config = ConfigDict(extra="forbid")

    # Fields that change how an object LOOKS, never what a run builds. An
    # input's label is the plain case: renaming it rebuilt the input's options
    # and everything downstream, for a string the query never sees.
    #
    # Empty by default on purpose. An unclassified field counts as data, so a
    # field nobody got round to annotating causes an unnecessary run rather
    # than skipping a real change — the same direction the rest of the
    # change detection leans.
    presentation_fields: ClassVar[FrozenSet[str]] = frozenset()

    path: Optional[str] = Field(None, description="A unique path to this object")

    def data_config(self):
        """This object as a dict, with presentation-only fields removed.

        What a run actually depends on. Two objects with equal ``data_config``
        produce the same artifacts, so an edit that leaves it unchanged needs
        no run — only the new config stored.

        Nested models are descended into so each class can answer for its own
        fields — an input's ``display`` holds both a widget style and a default
        that may carry a query, and only that class can tell them apart. None
        of the nested classes declare anything yet, so today they contribute
        every field.

        ``path`` goes too. It is a location in the project file, not an input
        to anything a job runs, and moving an object between files would
        otherwise rebuild it.
        """
        return _data_config(self)

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
            isinstance(obj, str) and re.search(REF_PROPERTY_PATTERN, obj)
        ) or ContextString.is_context_string(obj)

    def __hash__(self):
        return hash(self.__str__())

    def __str__(self):
        if self.id() is None:
            return self.__class__.__name__
        return self.id()


def _data_config(value):
    """``value`` with every model's presentation fields dropped, recursively.

    Matches any pydantic model, not just this ``BaseModel``. Nested config
    classes — an input's ``display``, a source's connection block — extend
    pydantic directly, and stopping at them would leave a whole subtree
    compared by identity.
    """
    if isinstance(value, PydanticBaseModel):
        dropped = getattr(value, "presentation_fields", frozenset()) | {"path"}
        # Declared fields AND extras. An insight's ``props`` allows extras —
        # ``props.x`` is the query itself — so reading ``model_fields`` alone
        # dropped every one of them and no insight edit registered as data.
        names = list(value.__class__.model_fields) + list(value.__pydantic_extra__ or {})
        return {name: _data_config(getattr(value, name)) for name in names if name not in dropped}
    if isinstance(value, dict):
        return {key: _data_config(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_data_config(item) for item in value]
    return value
