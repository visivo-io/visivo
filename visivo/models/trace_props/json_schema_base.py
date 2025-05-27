from pydantic import ConfigDict, BaseModel
from typing import Any, Dict


class JsonSchemaBase(BaseModel):

    def dict(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        kwargs.setdefault("exclude_none", True)
        return super().model_dump(*args, **kwargs)

    model_config = ConfigDict(extra="allow")
