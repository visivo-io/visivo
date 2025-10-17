from datetime import date
from enum import Enum
import re
from typing import List, Optional, Union

from pydantic import Field, model_serializer
from visivo.logger.logger import Logger
from visivo.models.base.context_string import ContextString
from visivo.query.patterns import CONTEXT_STRING_REF_PATTERN, get_model_name_from_match
from visivo.models.base.named_model import NamedModel
from visivo.models.base.parent_model import ParentModel
from visivo.models.base.query_string import QueryString
from visivo.query.sqlglot_utils import parse_expression


class InputTypes(str, Enum):
    DROPDOWN = "dropdown"


class Input(NamedModel, ParentModel):
    type: InputTypes = Field(
        default=InputTypes.DROPDOWN,
        description="Type of input component (dropdown)",
    )
    label: Optional[str] = Field(
        default=None,
        description="Label shown to the user",
    )
    default: Optional[Union[str, int, float, bool, date, List[str]]] = None

    def _resolve_query_references(self, query_value: str, dag) -> str:
        """Resolve all ${ref(...)} patterns in query string using DAG lookup."""        
        pass #TODO: create a resolver that works with implicit dimensions (ie. ${ref(model)."column on model"}), global (ie. ${ref(...)} ) and field references (ie. ${ref(model)."field in dag"})

    def child_items(self):
        return []

    @model_serializer(mode="wrap")
    def serialize_model(self, serializer, info):
        model = serializer(self)

        if hasattr(self, "options") and model.get("options"):
            dag = info.context.get("dag") if info and info.context else None

            if isinstance(self.options, list):
                model["options"] = [str(option) for option in self.options]
            elif isinstance(self.options, QueryString):
                query_value = self.options.get_value()
                model["options"] = parse_expression(
                    self._resolve_query_references(query_value, dag), "duckdb"
                ).sql()
                model["is_query"] = True

        return model
