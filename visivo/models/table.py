from typing import List, Union
from .trace import Trace
from pydantic import StringConstraints, Field
from .base.named_model import NamedModel
from .base.parent_model import ParentModel
from .base.base_model import REF_REGEX
from typing_extensions import Annotated


class Table(NamedModel, ParentModel):
    """
    Tables enable you to represent the data aggregated in your trace in a tabular format. Tables are built on the [material react table framework](https://www.material-react-table.com/). 

    ??? note

        We're actively working on improving the table interface and incorporating more features from material react table such as [aggregation & grouping](https://www.material-react-table.com/docs/guides/aggregation-and-grouping). 
    """
    trace: Union[Annotated[str, StringConstraints(pattern=REF_REGEX)], Trace] = Field(
        ...,
        description="A ref() to a trace or trace defined in line. Data for the table will come from the trace.",
    )
    columns: List[dict] = Field(
        ...,
        description="A list of dictionaries that contain the keys `header` and `column`. `header` is the title of the column in the table. `column` is the column name from the trace that you want to include in the table."
    )

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
