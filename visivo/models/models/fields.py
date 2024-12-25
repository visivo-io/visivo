import re
from typing import Any, Union
from typing_extensions import Annotated
from pydantic import Discriminator, Tag
from visivo.models.base.base_model import ContextStringType, RefStringType
from visivo.models.base.context_string import CONTEXT_STRING_VALUE_REGEX
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.sql_model import SqlModel


def get_model_discriminator_value(value: Any) -> str:
    if isinstance(value, str) and re.search(CONTEXT_STRING_VALUE_REGEX, value):
        return "Context"
    elif isinstance(value, str):
        return "Ref"
    elif isinstance(value, dict):
        if "args" in value:
            return "CsvScript"
        elif "models" in value:
            return "LocalMerge"
        elif "sql" in value:
            return "Sql"
    elif hasattr(value, "args"):
        return "CsvScript"
    elif hasattr(value, "models"):
        return "LocalMerge"
    elif hasattr(value, "sql"):
        return "Sql"

    return None


ModelField = Annotated[
    Union[
        Annotated[SqlModel, Tag("Sql")],
        Annotated[CsvScriptModel, Tag("CsvScript")],
        Annotated[LocalMergeModel, Tag("LocalMerge")],
    ],
    Discriminator(get_model_discriminator_value),
]

ModelRefField = Annotated[
    Union[
        RefStringType,
        ContextStringType,
        Annotated[SqlModel, Tag("Sql")],
        Annotated[CsvScriptModel, Tag("CsvScript")],
        Annotated[LocalMergeModel, Tag("LocalMerge")],
    ],
    Discriminator(get_model_discriminator_value),
]
