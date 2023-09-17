import pydantic
from pydantic import Extra


class TraceColumns(pydantic.BaseModel):
    model_config = pydantic.ConfigDict(extra="allow")
