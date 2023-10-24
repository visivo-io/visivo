from textwrap import dedent

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


def handle_attribute_properties(model_defs: dict ,attribute_property_object: dict):
    """Handle extracting type, description, default from different types of property objects that pydantic produces"""
    type, description, default = '', attribute_property_object.get('description', ''), 'None'
    
    attribute_key_type = '.'.join(list(attribute_property_object.keys()))
    if "allOf"  in attribute_key_type:
        default = attribute_property_object.get('default', 'None')
        enum_model_key = find_refs(attribute_property_object)[0].split('/')[-1]
        enum_model = model_defs.get(enum_model_key, {})
        if not enum_model:
            raise KeyError(f"Key {enum_model_key} was not found in $defs dictionary.")
        type = 'Enumerated - one of: ' + ', '.join(enum_model.get('enum'))
    elif "anyOf" in attribute_key_type:
        default = attribute_property_object.get('default', 'None')
        anyOf = find_refs(attribute_property_object)
        for option in attribute_property_object['anyOf']:
            if "pattern" in option and find_refs(attribute_property_object) == []:
                anyOf.append(f"Regex({option.get('pattern')})")
            elif "type" in option and "pattern" not in option:
                if option.get("type") not in ["null", "None"]:
                    anyOf.append(option.get("type"))
            else: 
                continue
        if len(anyOf) > 1:
            type = 'Any of: ' + ', '.join(anyOf)
        elif len(anyOf) == 1:
            type = anyOf[0]
    elif "const" in attribute_key_type:
        default = attribute_property_object.get('default', 'None')
        type = 'string'
    elif "items" in attribute_key_type:
        default = attribute_property_object.get('default', 'None')
        type = attribute_property_object.get('type')
        refs = find_refs(attribute_property_object.get('items', {}))
        if type == 'array' and refs:
            type = 'Array of ' + ' or '.join(refs)
    elif "discriminator" in attribute_key_type: 
        default_key = attribute_property_object.get('discriminator', {}).get('propertyName', '')
        default_value = attribute_property_object.get('default', {}).get(default_key)
        default = attribute_property_object.get('discriminator', {}).get('mapping', {}).get(default_value)
        refs = find_refs(attribute_property_object.get('oneOf', []))
        if refs:
            type = 'One of:<br>  •' + '<br>  •'.join(refs)
    else:
        default = attribute_property_object.get('default', "None")
        type = attribute_property_object.get('type', "")
    default = default if default else 'None'

    return type, description, default 

def from_pydantic_model(model_defs: dict, model_name: str) -> str:
    """Generates markdown from the model description and creates table of attributes from $defs in pydantic schema"""
    model_def = model_defs.get(model_name, {})
    if not model_def:
        raise KeyError(f"Schema missing model: {model_name}")
    model_properties = model_def.get('properties', {})
    model_md = '' if not model_def.get('description', {})  else dedent(model_def.get('description'))        
    md_table = "| Field | Type | Default | Description |\n|-------|------|---------|-------------|\n"

    for property_name, property_object in model_properties.items():
        field_type, field_description, field_default = handle_attribute_properties(property_object)
        md_table += f"| {property_name} | {field_type} | {field_default} | {field_description} |\n"

    return model_md + '\n' + md_table

def from_traceprop_model(model_def: dict) -> str:
    return 'temp'