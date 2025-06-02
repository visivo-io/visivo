from typing import Optional
import pydantic
import re

from visivo.models.base.context_string import ContextString
from .base_model import BaseModel, REF_REGEX

NAME_REGEX = r"^[a-zA-Z0-9\s'\"\-_]+$"


class NamedModel(BaseModel):
    def id(self):
        if self.name is not None:
            return str(self.name)
        else:
            return self.path

    name: Optional[str] = pydantic.Field(
        None, description="The unique name of the object across the entire project."
    )

    file_path: Optional[str] = pydantic.Field(
        None, description="The path to the file that contains the object definition."
    )

    @classmethod
    def get_name(cls, obj):
        if isinstance(obj, dict):
            return obj["name"]
        elif cls.is_obj(obj=obj):
            return obj.name
        elif ContextString.is_context_string(obj):
            if isinstance(obj, ContextString):
                return obj.get_reference()
            else:
                return ContextString(obj).get_reference()
        else:
            return re.match(REF_REGEX, obj).groupdict()["ref_name"]

    def __str__(self):
        if self.id() is None:
            return self.__class__.__name__
        return self.id()
