import pydantic
import re
from typing import Optional

REF_REGEX = r"^ref\(\s*(?P<ref_name>[a-zA-Z0-9\s'\"\-_]+)\)$"
NAME_REGEX = "^[a-zA-Z0-9\s'\"\-_]+$"


class BaseModel(pydantic.BaseModel):
    name: Optional[str] = pydantic.Field(
        None, description="The unique name of the object across the entire project."
    )

    @classmethod
    def is_obj(cls, obj) -> bool:
        return not cls.is_ref(obj)

    @classmethod
    def is_ref(cls, obj) -> bool:
        return isinstance(obj, str)

    @classmethod
    def get_name(cls, obj):
        if cls.is_obj(obj=obj):
            return obj.name
        else:
            return re.match(REF_REGEX, obj).groupdict()["ref_name"]
