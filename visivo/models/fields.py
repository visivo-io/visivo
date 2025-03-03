from visivo.models.base.query_string import QUERY_STRING_VALUE_REGEX, QueryString
from visivo.models.base.base_model import STATEMENT_REGEX
from typing import Annotated, Any, Union
import re
from pydantic import Discriminator, Tag


def get_discriminator_value(value: Any) -> str:
    if isinstance(value, str) and re.match(QUERY_STRING_VALUE_REGEX, value):
        return "Query"
    elif isinstance(value, QueryString):
        return "Query"

    return "String"


QueryOrStringField = Annotated[
    Union[
        Annotated[QueryString, Tag("Query")],
        Annotated[str, Tag("String")],
    ],
    Discriminator(get_discriminator_value),
]
