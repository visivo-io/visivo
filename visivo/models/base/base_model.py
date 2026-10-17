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
from visivo.models.base.query_string import QueryString
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

    # Fields on THIS model that change how it looks, never what a run builds,
    # on top of ``ALWAYS_PRESENTATION``. An input's label is the plain case:
    # renaming it rebuilt the input's options and everything downstream, for a
    # string no query reads.
    #
    # Empty by default on purpose. Most data is static — a source's host, a
    # model's sql, a literal options list — so a field counts as data unless
    # named here, and a missed annotation costs an extra run rather than a
    # skipped one.
    presentation_fields: ClassVar[FrozenSet[str]] = frozenset()

    # For models that are purely presentation, where the answer depends on the
    # VALUE rather than the field: a plotly layout declares no fields at all,
    # so there is nothing to list, and everything in it is styling right up
    # until one of the values is a ``?{ }``.
    data_when_query_valued: ClassVar[bool] = False

    path: Optional[str] = Field(None, description="A unique path to this object")

    def data_config(self):
        """This object as a dict, with presentation-only fields removed.

        What a run actually depends on. Two objects with equal ``data_config``
        produce the same artifacts, so an edit that leaves it unchanged needs
        no run — only the new config stored.

        Two rules, separated by what the jobs were audited to read. A field
        counts as data unless its model names it presentation; a model that is
        purely presentation flips to counting only the values that reach a
        query.

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


# Never read by a job, on any model that has them. ``path`` and ``file_path``
# say where an object was authored — moving it between project files must not
# rebuild it — and a description is for people.
#
# Audited against every job (source schema, sql model, input, insight, model
# data): the only other reads of these are failure messages, which name the
# file an error came from and produce nothing.
ALWAYS_PRESENTATION = frozenset({"path", "file_path", "description"})


def _carries_query(value):
    """Whether this value reaches a query — directly or nested inside one.

    ``QueryString``/``ContextString`` when already coerced, and the raw markers
    when not: a value read straight from YAML is a plain ``str`` until its
    field's validator runs, and a dict of styling can hold one several levels
    down.
    """
    if isinstance(value, (QueryString, ContextString)):
        return True
    if isinstance(value, str):
        return "?{" in value or "${" in value
    if isinstance(value, dict):
        return any(_carries_query(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return any(_carries_query(item) for item in value)
    if isinstance(value, PydanticBaseModel):
        return any(_carries_query(item) for item in _field_values(value))
    return False


def _field_values(model):
    """Every value on a pydantic model — declared fields AND extras."""
    for name in _field_names(model):
        yield getattr(model, name)


def _field_names(model):
    """Declared fields AND extras.

    An insight's ``props`` allows extras — ``props.x`` IS the query — so
    reading ``model_fields`` alone drops every one of them and no insight edit
    registers as data at all.
    """
    return list(model.__class__.model_fields) + list(model.__pydantic_extra__ or {})


def _data_config(value):
    """``value`` with everything a job never reads dropped, recursively.

    Matches any pydantic model, not just this ``BaseModel``. Nested config
    classes — an input's ``display``, a chart's ``layout`` — extend pydantic
    directly, and stopping at them would leave a whole subtree compared by
    identity.

    Two rules, and the audit is what separates them. Most data is static: a
    source's ``host``, a model's ``sql``, an input's literal ``options`` list
    all get read by a job and none of them look like a query. So a field counts
    as data unless its model says otherwise, and a missed annotation costs an
    extra run rather than a skipped one.

    A model that is purely presentation says so with
    ``data_when_query_valued``, and then only the values that reach a query
    count. That is for the free-form ones — a plotly ``layout`` declares no
    fields at all, so there is nothing to list, and its values are styling
    right up until one of them is a ``?{ }``.
    """
    if isinstance(value, PydanticBaseModel):
        dropped = getattr(value, "presentation_fields", frozenset()) | ALWAYS_PRESENTATION
        by_value = getattr(value, "data_when_query_valued", False)
        config = {}
        for name in _field_names(value):
            if name in dropped:
                continue
            item = getattr(value, name)
            if by_value and not _carries_query(item):
                continue
            config[name] = _data_config(item)
        return config
    if isinstance(value, dict):
        return {key: _data_config(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_data_config(item) for item in value]
    return value
