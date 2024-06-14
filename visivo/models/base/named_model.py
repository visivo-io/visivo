import pydantic
import re
from .base_model import BaseModel, REF_REGEX

NAME_REGEX = r"^[a-zA-Z0-9\s'\"\-_]+$"


class NamedModel(BaseModel):
    def id(self):
        return self.__class__.__name__ + " - " + str(self.name)

    name: str = pydantic.Field(
        None, description="The unique name of the object across the entire project."
    )

    @classmethod
    def get_name(cls, obj):
        if isinstance(obj, dict):
            return obj["name"]
        elif cls.is_obj(obj=obj):
            return obj.name
        else:
            return re.match(REF_REGEX, obj).groupdict()["ref_name"]
