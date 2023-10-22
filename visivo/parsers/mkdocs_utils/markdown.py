
def find_refs(obj):
    refs = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key == '$ref':
                refs.append(value)
            elif isinstance(value, (dict, list)):
                refs.extend(find_refs(value))
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, (dict, list)):
                refs.extend(find_refs(item))
    return refs

def from_pydantic_model(model_def: dict) -> str:
    """Generates markdown from the model description and creates table of attributes from $defs in pydantic schema"""
    model_properties = model_def.get('properties', {})
    model_md = '' if not model_def.get('description', {})  else dedent(model_def.get('description'))        
    md_table = "| Field | Type | Default | Description |\n|-------|------|---------|-------------|\n"

    for property_name, property_object in model_properties.items():
        field_type = property_object.get('type')
        field_description = property_object.get('description', '-')
        field_default = '-' if property_object.get('default') == None else property_object.get('default')
        md_table += f"| {property_name} | {field_type} | {field_default} | {field_description} |\n"

    return model_md + '\n' + md_table

def from_traceprop_model(model_def: dict) -> str:
    return 'temp'



## to be migrated

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

from textwrap import dedent
import yaml
from typing import List, Union, Dict, Any, Type


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

def is_pydantic_model(cls) -> bool:
    """Check if a given class is a Pydantic model."""
    return isinstance(cls, type) and issubclass(cls, BaseModel)

def clean_field_type(field):
        field_annotation = str(field.annotation)
        return field_annotation.replace('typing.', '')


def pydantic_model_to_md_table(model_name: str):
    """Generates markdown tables for pydantics models"""
    model = _return_model(model_name)
    fields = model.__fields__
    model_md = '' if model.__doc__  == None else dedent(model.__doc__)        
    md_table = "| Field | Type | Default | Description |\n|-------|------|---------|-------------|\n"

    for field_name, field in fields.items():
        field_type = clean_field_type(field=field)
        field_description = field.description
        field_default = '-' if field.default == None else field.default
        md_table += f"| {field_name} | {field_type} | {field_default} | {field_description} |\n"

    return model_md + '\n' + md_table