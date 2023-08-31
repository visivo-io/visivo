from pydantic import BaseModel
from visivo.models.trace import Trace
from visivo.models.target import Target
from visivo.models.test import Test
from visivo.models.chart import Chart
from visivo.models.dashboard import Dashboard
from visivo.models.defaults import Defaults
from visivo.models.item import Item
from visivo.models.row import Row
from visivo.models.alert import Alert, SlackAlert, EmailAlert
from visivo.models.trace_props import (
    TraceProps,
    Mesh3d,
    Barpolar,
    Scattersmith,
    Streamtube,
    Cone,
    Scattermapbox,
    Scattergeo,
    Scatterpolar,
    Sunburst,
    Histogram2d,
    Isosurface,
    Violin,
    Scatter,
    Image,
    Ohlc,
    Heatmapgl,
    Indicator,
    Funnelarea,
    Carpet,
    Icicle,
    Surface,
    Parcats,
    Treemap,
    Funnel,
    Histogram2dcontour,
    Contourcarpet,
    Parcoords,
    Candlestick,
    Scatter3d,
    Waterfall,
    Choropleth,
    Heatmap,
    Histogram,
    Volume,
    Contour,
    Scatterternary,
    Sankey,
    Scattercarpet,
    Densitymapbox,
    Choroplethmapbox,
    Box,
    Pie,
    Bar,
    Scatterpolargl,
    Scattergl,
    Splom,
)
from textwrap import dedent
import yaml
from typing import List, Union, Dict, Any, Type

from mkdocs_click._extension import replace_command_docs

def _return_model(model_name: str) -> BaseModel:
    match model_name:
        case 'trace':
            return Trace
        case 'target':
            return Target
        case 'test':
            return Test
        case 'chart':
            return Chart
        case 'dashboard':
            return Dashboard
        case 'default':
            return Defaults
        case 'item':
            return Item
        case 'row':
            return Row
        case 'alert':
            return Alert
        case 'slack-alert':
            return SlackAlert
        case 'email-alert':
            return EmailAlert

def _return_trace_prop_model(model_name: str) -> TraceProps:
    match model_name:
        case 'scatter':
            return Scatter
        case 'bar':
            return Bar
        case 'waterfall':
            return Waterfall
        case 'mesh3d':
            return Mesh3d
        case 'barpolar':
            return Barpolar
        case 'scattersmith': 
            return Scattersmith
        case 'streamtube':
            return Streamtube
        case 'cone': 
            return Cone
        case 'scattermapbox':
            return Scattermapbox
        case 'scattergeo': 
            return Scattergeo
        case 'scatterpolar':
            return Scatterpolar
        case 'sunburst':
            return Sunburst
        case 'histogram2d':
            return Histogram2d
        case 'isosurface':
            return Isosurface
        case 'violin':
            return Violin
        case 'image':
            return Image
        case 'ohlc':
            return Ohlc
        case 'heatmapgl':
            return Heatmapgl
        case 'indicator':
            return Indicator
        case 'funnelarea':
            return Funnelarea
        case 'carpet': 
            return Carpet
        case 'icicle':
            return Icicle
        case 'surface':
            return Surface
        case 'parcats': 
            return Parcats
        case 'treemap':
            return Treemap
        case 'funnel':
            return Funnel
        case 'histogram2dcontour':
            return Histogram2dcontour
        case 'contourcarpet':
            return Contourcarpet
        case 'parcoords':
            return Parcoords
        case 'candlestick':
            return Candlestick
        case 'scatter3d':
            return Scatter3d
        case 'choropleth':
            return Choropleth
        case 'heatmap':
            return Heatmap
        case 'histogram': 
            return Histogram
        case 'volume':
            return Volume
        case 'contour':
            return Contour
        case 'scatterternary':
            return Scatterternary
        case 'sankey':
            return Sankey
        case 'scattercarpet':
            return Scattercarpet
        case 'densitymapbox':
            return Densitymapbox
        case 'choroplethmapbox':
            return Choroplethmapbox
        case 'box':
            return Box
        case 'pie':
            return Pie
        case 'scatterpolargl':
            return Scatterpolargl
        case 'scattergl':
            return Scattergl
        case 'splom':
            return Splom
        
def is_pydantic_model(cls) -> bool:
    """Check if a given class is a Pydantic model."""
    return isinstance(cls, type) and issubclass(cls, BaseModel)

# ... other parts of your code remain unchanged

def extract_model_info(model: Type[BaseModel]) -> Dict[str, Any]:
    output = {}

    for field_name, field_info in model.model_fields.items():
        field_type = field_info.annotation
        field_description = '' if field_info.description == None else ' #' + field_info.description
        # Check if the field is Optional
        if hasattr(field_type, "__origin__") and field_type.__origin__ == Union:
            actual_type = next(t for t in field_type.__args__ if t != type(None))
            optional_indicator = " (optional)"
        else:
            actual_type = field_type
            optional_indicator = ""

        if is_pydantic_model(actual_type): 
            output[field_name] = extract_model_info(actual_type)
        elif hasattr(actual_type, "__origin__") and actual_type.__origin__ in (list, List):
            list_inner_type = actual_type.__args__[0]
            if is_pydantic_model(list_inner_type): 
                output[field_name] = [extract_model_info(list_inner_type)]
            else:
                output[field_name] = [list_inner_type.__name__]
        else:
            output[field_name] = actual_type.__name__ + optional_indicator #+ field_description

    return output


def generate_yaml_from_model(model: Type[BaseModel]) -> str:
    return yaml.dump(extract_model_info(model), sort_keys=False)        


def define_env(env):
    def pydantic_model_to_md_table(model_name: str):
        """Generates markdown tables for pydantics models"""
        model = _return_model(model_name)
        fields = model.__fields__
        model_md = '' if model.__doc__  == None else dedent(model.__doc__)        
        md_table = "| Field | Type | Default | Description |\n|-------|------|---------|-------------|\n"

        def clean_field_type(field):
            field_annotation = str(field.annotation)
            return field_annotation.replace('typing.', '')

        for field_name, field in fields.items():
            field_type = clean_field_type(field=field)
            field_description = field.description
            field_default = '-' if field.default == None else field.default
            md_table += f"| {field_name} | {field_type} | {field_default} | {field_description} |\n"

        return model_md + '\n' + md_table
    
    env.macro(pydantic_model_to_md_table, "render_pydantic_model")

    def render_click_docs( has_attr_list= False, options= {}):
        """Generates Click markdown docs via macro rather than markdown extension"""
        docs = replace_command_docs( has_attr_list, **options )
        str_docs = '\n'.join(list(docs))
        return str_docs

    env.macro(render_click_docs, "render_click_docs")

    def pydantic_trace_props_model_to_md(model_name: str):
        model = _return_trace_prop_model(model_name)
        yml = generate_yaml_from_model(model)
        return yml 
    
    env.macro(pydantic_trace_props_model_to_md, "render_pydantic_trace_props_model")
