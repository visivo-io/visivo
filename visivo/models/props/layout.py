from importlib.resources import files
import json
from jsonschema_rs import ValidationError, validator_for
from pydantic import model_validator
from visivo.models.color_palette import ColorPalette
from visivo.models.props.json_schema_base import JsonSchemaBase, get_message_from_error

LAYOUT_DOCS_URL = "https://docs.visivo.io/reference/configuration/Chart/Layout/"


class Layout(JsonSchemaBase):

    @model_validator(mode="before")
    @classmethod
    def validate_title_shape(cls, data: dict) -> dict:
        """Catch the common new-user mistake of writing ``title: "string"`` at the
        top level or under any ``axis``/``yaxis``/``xaxis`` key, which Plotly
        rejects with an opaque schema-validation message."""
        if not isinstance(data, dict):
            return data

        title_value = data.get("title")
        if isinstance(title_value, str):
            raise ValueError(
                f'`layout.title` must be an object: `{{text: "{title_value}"}}`. '
                f'Got string `"{title_value}"`. See {LAYOUT_DOCS_URL}.'
            )

        # Same mistake is common under axis configs (xaxis.title, yaxis.title,
        # yaxis2.title, etc.).
        for key, value in data.items():
            if key.endswith("axis") or key.startswith(("xaxis", "yaxis")):
                if isinstance(value, dict):
                    sub_title = value.get("title")
                    if isinstance(sub_title, str):
                        raise ValueError(
                            f"`layout.{key}.title` must be an object: "
                            f'`{{text: "{sub_title}"}}`. Got string '
                            f'`"{sub_title}"`. See {LAYOUT_DOCS_URL}.'
                        )

        return data

    @model_validator(mode="before")
    @classmethod
    def validate_colorway(cls, data: dict) -> dict:
        v = data.get("colorway")

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
