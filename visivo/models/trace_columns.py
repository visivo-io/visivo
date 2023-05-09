import pydantic
from pydantic import Extra


class TraceColumns(pydantic.BaseModel, extra=Extra.allow):
    pass
