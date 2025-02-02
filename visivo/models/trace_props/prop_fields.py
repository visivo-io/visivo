import re
from typing import Annotated, Any, Union

from pydantic import constr
from pydantic import Discriminator, Tag, constr
from visivo.models.base.base_model import STATEMENT_REGEX
from visivo.models.base.context_string import CONTEXT_STRING_VALUE_REGEX, ContextString
from visivo.models.base.query_string import QUERY_STRING_VALUE_REGEX, QueryString


def get_model_discriminator_value(value: Any) -> str:
    if isinstance(value, str) and re.match(QUERY_STRING_VALUE_REGEX, value):
        return "Query"
    elif isinstance(value, str) and re.match(CONTEXT_STRING_VALUE_REGEX, value):
        return "Context"
    elif isinstance(value, str):
        return "Statement"

    return None


ArrayField = Annotated[
    Union[
        Annotated[QueryString, Tag("Query")],
        Annotated[ContextString, Tag("Context")],
        Annotated[constr(pattern=STATEMENT_REGEX), Tag("Statement")],
    ],
    Discriminator(get_model_discriminator_value),
]
