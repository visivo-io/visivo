from typing import Optional
import pydantic
import re
import hashlib

from visivo.models.base.context_string import ContextString
from visivo.models.base.base_model import BaseModel, REF_PROPERTY_PATTERN
from visivo.query.patterns import get_model_name_from_match

NAME_REGEX = r"^[a-zA-Z0-9\s'\"\-_]+$"


def alpha_hash(text: str, length: int = 28) -> str:
    """
    Generate an alphabetical-only hash (a-z) from the input text.
    Uses MD5 and converts to base26 encoding.

    This produces only lowercase letters, making it safe for use as SQL identifiers
    in databases like MySQL, Snowflake, and BigQuery that don't allow digits
    in identifiers even when quoted.

    Args:
        text: Input string to hash
        length: Desired length of output (default 28 chars for ~128 bits of entropy)

    Returns:
        Lowercase alphabetical string prefixed with 'm'
    """
    hash_bytes = hashlib.md5(text.encode()).digest()
    hash_int = int.from_bytes(hash_bytes, "big")

    result = []
    for _ in range(length):
        result.append(chr(ord("a") + (hash_int % 26)))
        hash_int //= 26

    return "m" + "".join(result)


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

    def name_hash(self) -> Optional[str]:
        if self.name:
            return alpha_hash(self.name)
        return None

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
            match = re.match(REF_PROPERTY_PATTERN, obj)
            return get_model_name_from_match(match)

    def __str__(self):
        if self.id() is None:
            return self.__class__.__name__
        return self.id()
