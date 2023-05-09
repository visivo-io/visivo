from pydantic import BaseModel
from visivo.models.trace import Trace
from visivo.models.target import Target
from visivo.models.test import Test
from visivo.models.chart import Chart
from visivo.models.dashboard import Dashboard
from visivo.models.defaults import Defaults
from visivo.models.item import Item
from visivo.models.row import Row
from visivo.models.alert import Alert

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


def define_env(env):
    def pydantic_model_to_md_table(model_name: str):
        """Generates markdown tables for pydantics models"""
        model = _return_model(model_name)
        fields = model.__fields__
        model_md = '' if model.__doc__  == None else model.__doc__
        md_table = "| Field | Type | Description |\n|-------|------|-------------|\n"

        for field_name, field in fields.items():
            field_type = field.outer_type_.__name__
            field_description = field.field_info.description
            md_table += f"| {field_name} | {field_type} | {field_description} |\n"

        return model_md + '\n' + md_table
    
    env.macro(pydantic_model_to_md_table, "render_pydantic_model")

    def render_click_docs( has_attr_list= False, options= {}):
        """Generates Click markdown docs via macro rather than markdown extension"""
        docs = replace_command_docs( has_attr_list, **options )
        str_docs = '\n'.join(list(docs))
        return str_docs

    env.macro(render_click_docs, "render_click_docs")
