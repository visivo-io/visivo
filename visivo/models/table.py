from typing import List, Union
from .base_model import BaseModel, REF_REGEX
from .trace import Trace
from pydantic import constr


class Table(BaseModel):
    trace: Union[constr(regex=REF_REGEX), Trace]
    columns: List[dict]

    def find_trace(self, name: str):
        if self.trace.name == name:
            return self.trace

    @property
    def trace_objs(self) -> List[Trace]:
        if Trace.is_obj(self.trace):
            return [self.trace]
        return []

    @property
    def trace_refs(self) -> List[str]:
        if Trace.is_ref(self.trace):
            return [self.trace]
        return []
