from enum import Enum
from pydantic import Field, model_validator
from jsonschema_rs import validator_for
import json
from importlib.resources import files
from jsonschema_rs import ValidationError

from visivo.models.props.json_schema_base import JsonSchemaBase, get_message_from_error
from visivo.models.props.types import PropType


class InsightProps(JsonSchemaBase):

    type: PropType = Field(..., description="Type of the trace")

    @model_validator(mode="after")
    def validate_against_schema(self) -> "InsightProps":
        if not hasattr(InsightProps, "_validators"):
            InsightProps._validators = {}
        if not hasattr(InsightProps, "_schemas"):
            InsightProps._schemas = {}

        if self.type.value not in InsightProps._validators:
            schema_path = files("visivo.schema").joinpath(f"{self.type.value}.schema.json")
            with open(schema_path) as f:
                schema = json.load(f)
            InsightProps._schemas[self.type.value] = schema
            InsightProps._validators[self.type.value] = validator_for(schema)

        validator = InsightProps._validators.get(self.type.value)
        if not validator:
            raise ValueError(f"Schema not found for trace type: {self.type.value}")

        try:
            data_dict = self.model_dump()

            validator.validate(data_dict)

        except FileNotFoundError:
            raise ValueError(f"Schema file not found for trace type: {self.type.value}")
        except json.JSONDecodeError:
            raise ValueError(f"Invalid JSON in schema file for trace type: {self.type.value}")
        except ValidationError as e:
            schema = InsightProps._schemas.get(self.type.value)
            message = get_message_from_error(e, schema)
            raise ValueError(
                f"Validation error for trace type {self.type.value} at location: {e.instance_path}: {str(message)}"
            )

        return self
