import pydantic
import re

REF_REGEX = r"^ref\(\s*(?P<ref_name>[a-zA-Z0-9\s'\"\-_]+)\)$"
STATEMENT_REGEX = r"^\s*query\(\s*(?P<query_statement>.+)\)\s*$|^\s*column\(\s*(?P<column_name>.+)\)\s*$"
INDEXED_STATEMENT_REGEX = r"^\s*column\(\s*(?P<column_name>.+)\)\[[0-9]+\]\s*$"

class BaseModel(pydantic.BaseModel):
    model_config = pydantic.ConfigDict(extra='forbid')

    def id(self):
        return (
            self.__class__.__name__
            + " - "
            + str(hash((type(self),) + tuple(self.__dict__.values())))
        )

    @classmethod
    def is_obj(cls, obj) -> bool:
        return not cls.is_ref(obj)

    @classmethod
    def is_ref(cls, obj) -> bool:
        return isinstance(obj, str) and re.search(REF_REGEX, obj)

    def __hash__(self):
        return hash(self.__str__())

    def __str__(self):
        return self.id()
