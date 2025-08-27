from jsonschema_rs import ValidationError
from pydantic import ConfigDict, BaseModel
from typing import Any, Dict
import json


def get_message_from_error(error: ValidationError, schema: Dict[str, Any]) -> str:
    message = str(error.message)
    if "is not valid under any of the schemas listed in the" in message:
        current = schema["properties"]
        for part in error.instance_path:
            current = current.get(part, {})
        message_parts = []
        for oneOf in current.get("oneOf", []):
            message_parts.append(json.dumps(oneOf))
        message = "Value does not match any of the following schemas: \n" + "\n or \n".join(
            message_parts
        )
    return message


class JsonSchemaBase(BaseModel):

    def dict(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        kwargs.setdefault("exclude_none", True)
        return super().model_dump(*args, **kwargs)

    model_config = ConfigDict(extra="allow")
