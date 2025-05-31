from enum import Enum
from pydantic import Field, model_validator
from jsonschema_rs import validator_for
import json
from importlib.resources import files
from jsonschema_rs import ValidationError


from enum import Enum

from visivo.models.trace_props.json_schema_base import JsonSchemaBase, get_message_from_error


class TraceType(str, Enum):
    BAR = "bar"
    BARPOLAR = "barpolar"
    BOX = "box"
    CANDLESTICK = "candlestick"
    CARPET = "carpet"
    CHOROPLETH = "choropleth"
    CHOROPLETHMAP = "choroplethmap"
    CHOROPLETHMAPBOX = "choroplethmapbox"
    CONE = "cone"
    CONTOUR = "contour"
    CONTOURCARPET = "contourcarpet"
    DENSITYMAP = "densitymap"
    DENSITYMAPBOX = "densitymapbox"
    FUNNEL = "funnel"
    FUNNELAREA = "funnelarea"
    HEATMAP = "heatmap"
    HISTOGRAM = "histogram"
    HISTOGRAM2D = "histogram2d"
    HISTOGRAM2DCONTOUR = "histogram2dcontour"
    ICICLE = "icicle"
    IMAGE = "image"
    INDICATOR = "indicator"
    ISOSURFACE = "isosurface"
    MESH3D = "mesh3d"
    OHLC = "ohlc"
    PARCATS = "parcats"
    PARCOORDS = "parcoords"
    PIE = "pie"
    SANKEY = "sankey"
    SCATTER = "scatter"
    SCATTER3D = "scatter3d"
    SCATTERCARPET = "scattercarpet"
    SCATTERGEO = "scattergeo"
    SCATTERGL = "scattergl"
    SCATTERMAP = "scattermap"
    SCATTERMAPBOX = "scattermapbox"
    SCATTERPOLAR = "scatterpolar"
    SCATTERPOLARGL = "scatterpolargl"
    SCATTERSMITH = "scattersmith"
    SCATTERTERNARY = "scatterternary"
    SPLOM = "splom"
    STREAMTUBE = "streamtube"
    SUNBURST = "sunburst"
    SURFACE = "surface"
    TREEMAP = "treemap"
    VIOLIN = "violin"
    VOLUME = "volume"
    WATERFALL = "waterfall"


class TraceProps(JsonSchemaBase):

    type: TraceType = Field(..., description="Type of the trace")

    @model_validator(mode="after")
    def validate_against_schema(self) -> "TraceProps":
        if not hasattr(TraceProps, "_validators"):
            TraceProps._validators = {}
        if not hasattr(TraceProps, "_schemas"):
            TraceProps._schemas = {}

        if self.type.value not in TraceProps._validators:
            schema_path = files("visivo.schema").joinpath(f"{self.type.value}.schema.json")
            with open(schema_path) as f:
                schema = json.load(f)
            TraceProps._schemas[self.type.value] = schema
            TraceProps._validators[self.type.value] = validator_for(schema)

        validator = TraceProps._validators.get(self.type.value)
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
            schema = TraceProps._schemas.get(self.type.value)
            message = get_message_from_error(e, schema)
            raise ValueError(
                f"Validation error for trace type {self.type.value} at location: {e.instance_path}: {str(message)}"
            )

        return self
