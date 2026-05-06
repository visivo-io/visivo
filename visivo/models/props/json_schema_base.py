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
    elif "Additional properties are not allowed" in message or (
        "additionalProperties" in message and "not allowed" in message
    ):
        # B08: the default jsonschema_rs message names a single offending
        # property (e.g. "'file_path' was unexpected"), which is misleading
        # when the user added a different unknown prop and just happens to
        # see whichever key got picked first. Append a list of valid props
        # so authors can spot typos.
        valid = sorted((schema.get("properties") or {}).keys())
        if valid:
            preview = ", ".join(valid[:25])
            ellipsis = "..." if len(valid) > 25 else ""
            message = (
                f"{message}\n  Valid Plotly properties for this insight type: "
                f"{preview}{ellipsis}"
            )
    return message


class JsonSchemaBase(BaseModel):

    def dict(self, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        kwargs.setdefault("exclude_none", True)
        return super().model_dump(*args, **kwargs)

    model_config = ConfigDict(extra="allow")
