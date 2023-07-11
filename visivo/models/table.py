from typing import List, Union
from .trace import Trace
from pydantic import constr
from .base.named_model import NamedModel
from .base.parent_model import ParentModel
from .base.base_model import REF_REGEX


class Table(NamedModel, ParentModel):
    trace: Union[constr(regex=REF_REGEX), Trace]
    columns: List[dict]

    def child_items(self):
        return [self.trace]


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
