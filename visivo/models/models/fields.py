from typing import Any, Union
from typing_extensions import Annotated
from pydantic import Discriminator, Tag
from visivo.models.base.base_model import RefString
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.sql_model import SqlModel


def get_model_discriminator_value(value: Any) -> str:
    if isinstance(value, str):
        return "Ref"
    if isinstance(value, dict):
        if "args" in value:
            return "CsvScript"
        if "models" in value:
            return "LocalMerge"
        if "sql" in value:
            return "Sql"
    if hasattr(value, "args"):
        return "CsvScript"
    if hasattr(value, "models"):
        return "LocalMerge"
    if hasattr(value, "sql"):
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
        RefString,
        Annotated[SqlModel, Tag("Sql")],
        Annotated[CsvScriptModel, Tag("CsvScript")],
        Annotated[LocalMergeModel, Tag("LocalMerge")],
    ],
    Discriminator(get_model_discriminator_value),
]
