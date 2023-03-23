from typing import List, Union
from .base_model import BaseModel, REF_REGEX
from .trace import Trace
from pydantic import constr


class Chart(BaseModel):
    traces: List[Union[constr(regex=REF_REGEX), Trace]] = []
    layout: dict = {}

    def find_trace(self, name: str):
        return next((t for t in self.traces if t.name == name), None)

    @property
    def trace_objs(self) -> List[Trace]:
        return list(filter(Trace.is_obj, self.traces))

    @property
    def trace_refs(self) -> List[str]:
        return list(filter(Trace.is_ref, self.traces))
