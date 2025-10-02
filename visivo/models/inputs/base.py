from datetime import date
from enum import Enum
import re
from typing import List, Optional, Union

from pydantic import Field, model_serializer
from visivo.logger.logger import Logger
from visivo.models.base.context_string import ContextString
from visivo.query.patterns import REF_PATTERN
from visivo.models.base.named_model import NamedModel
from visivo.models.base.query_string import QueryString


class InputTypes(str, Enum):
    DROPDOWN = "dropdown"


class Input(NamedModel):
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

        def resolve_match(match: re.Match) -> str:
            ref_name = match.group('model_name')
            try:
                context_str = ContextString(f"${{ref({ref_name})}}")
                item = context_str.get_item(dag) if dag else None
                return item.name if item else ref_name
            except Exception as e:
                Logger.instance().error(f"Failed to resolve ref {ref_name}: {e}")
                return ref_name

        return re.sub(REF_PATTERN, resolve_match, query_value)

    @model_serializer(mode="wrap")
    def serialize_model(self, serializer, info):
        model = serializer(self)

        if hasattr(self, "options") and model.get("options"):
            dag = info.context.get("dag") if info and info.context else None

            if isinstance(self.options, list):
                model["options"] = [str(option) for option in self.options]
            elif isinstance(self.options, QueryString):
                query_value = self.options.get_value()
                model["options"] = self._resolve_query_references(query_value, dag)

        return model
