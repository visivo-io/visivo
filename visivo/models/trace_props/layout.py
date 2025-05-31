from importlib.resources import files
import json
from jsonschema_rs import ValidationError, validator_for
from pydantic import model_validator
from visivo.models.color_palette import ColorPalette
from visivo.models.trace_props.json_schema_base import JsonSchemaBase, get_message_from_error


class Layout(JsonSchemaBase):

    @model_validator(mode="before")
    @classmethod
    def validate_colorway(cls, data: dict) -> dict:
        v = data.get("colorway", "High Contrast")  # Also handle case where colorway isn't in data

        if v is None:
            return data

        if isinstance(v, str):
            if v not in ColorPalette.PREDEFINED_PALETTES:
                raise ValueError(
                    f"Invalid palette name. Choose from: {', '.join(ColorPalette.PREDEFINED_PALETTES.keys())}"
                )
            data["colorway"] = ColorPalette.PREDEFINED_PALETTES[v]
            return data

        if isinstance(v, list):
            for color in v:
                if not isinstance(color, str):
                    raise ValueError("All colors must be strings")
            return data

        raise ValueError("colorway must be either a palette name or list of colors")

    @model_validator(mode="after")
    def validate_against_schema(self) -> "Layout":
        if not hasattr(Layout, "_schema"):
            schema_path = files("visivo.schema").joinpath(f"layout.schema.json")
            with open(schema_path) as f:
                Layout._schema = json.load(f)

        if not hasattr(Layout, "_validator"):
            Layout._validator = validator_for(Layout._schema)

        validator = Layout._validator
        if not validator:
            raise ValueError("Schema not found for layout")

        try:
            data_dict = self.model_dump()

            validator.validate(data_dict)

        except FileNotFoundError:
            raise ValueError("Schema file not found for layout")
        except json.JSONDecodeError:
            raise ValueError("Invalid JSON in schema file for layout")
        except ValidationError as e:
            message = get_message_from_error(e, Layout._schema)
            raise ValueError(
                f"Validation error for layout at location: {e.instance_path}: {message}"
            )

        return self
