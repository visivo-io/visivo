import re
from typing import Annotated, Any, List, Union

from pydantic import Discriminator, Tag, constr
from visivo.models.base.base_model import INDEXED_STATEMENT_REGEX, STATEMENT_REGEX
from visivo.models.base.context_string import CONTEXT_STRING_VALUE_REGEX, ContextString
from visivo.models.base.query_string import QUERY_STRING_VALUE_REGEX, QueryString


def get_statement_model_discriminator_value(value: Any) -> str:
    if isinstance(value, str) and re.match(QUERY_STRING_VALUE_REGEX, value):
        return "Query"
    elif isinstance(value, QueryString):
        return "Query"
    elif isinstance(value, str) and re.match(CONTEXT_STRING_VALUE_REGEX, value):
        return "Context"
    elif isinstance(value, ContextString):
        return "Context"
    elif isinstance(value, str) and re.match(STATEMENT_REGEX, value):
        return "Statement"
    return None


StatementField = Annotated[
    Union[
        Annotated[QueryString, Tag("Query")],
        Annotated[ContextString, Tag("Context")],
        Annotated[constr(pattern=STATEMENT_REGEX), Tag("Statement")],
    ],
    Discriminator(get_statement_model_discriminator_value),
]


def get_statement_list_model_discriminator_value(value: Any) -> str:
    statement_value = get_statement_model_discriminator_value(value)
    if statement_value:
        return statement_value
    elif isinstance(value, list):
        return "List"
    return None


StatementListField = Annotated[
    Union[
        Annotated[QueryString, Tag("Query")],
        Annotated[ContextString, Tag("Context")],
        Annotated[constr(pattern=STATEMENT_REGEX), Tag("Statement")],
        Annotated[List, Tag("List")],
    ],
    Discriminator(get_statement_list_model_discriminator_value),
]

StatementListIntField = Annotated[
    Union[
        Annotated[QueryString, Tag("Query")],
        Annotated[ContextString, Tag("Context")],
        Annotated[constr(pattern=STATEMENT_REGEX), Tag("Statement")],
        Annotated[List[int], Tag("List")],
    ],
    Discriminator(get_statement_list_model_discriminator_value),
]


def get_indexed_statement_model_discriminator_value(value: Any) -> str:
    if isinstance(value, str) and re.match(QUERY_STRING_VALUE_REGEX, value):
        return "Query"
    elif isinstance(value, QueryString):
        return "Query"
    elif isinstance(value, str) and re.match(CONTEXT_STRING_VALUE_REGEX, value):
        return "Context"
    elif isinstance(value, ContextString):
        return "Context"
    elif isinstance(value, str) and re.match(INDEXED_STATEMENT_REGEX, value):
        return "IndexedStatement"

    return None


IndexedStatementField = Annotated[
    Union[
        Annotated[QueryString, Tag("Query")],
        Annotated[ContextString, Tag("Context")],
        Annotated[constr(pattern=INDEXED_STATEMENT_REGEX), Tag("IndexedStatement")],
    ],
    Discriminator(get_indexed_statement_model_discriminator_value),
]
