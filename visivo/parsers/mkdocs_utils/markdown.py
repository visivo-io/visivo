from textwrap import dedent
import yaml
import re


def find_refs(obj):
    refs = []
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key == "$ref":
                refs.append(value)
            elif isinstance(value, (dict, list)):
                refs.extend(find_refs(value))
    elif isinstance(obj, list):
        for item in obj:
            if isinstance(item, (dict, list)):
                refs.extend(find_refs(item))
    return sorted(refs)


def handle_allOf(attribute_property_object: dict, model_defs: dict):

    default = attribute_property_object.get("default", "None")
    model_key = find_refs(attribute_property_object)[0].split("/")[-1]
    model = model_defs.get(model_key, {})
    if not model:
        raise KeyError(f"Key {model_key} was not found in $defs dictionary.")

    if model.get('enum'):
        if model.get('type') not in ['string', 'object']:
            enum_options = [ str(a) for a in  model.get("enum")]
        else:
            enum_options = model.get("enum")
        type = "Enumerated - one of: " + ", ".join(enum_options)
    else:
        type = model.get("type", "None")

    return type, default


def handle_anyOf(attribute_property_object: dict):
    default = attribute_property_object.get("default", "None")
    anyOf = find_refs(attribute_property_object)
    for option in attribute_property_object["anyOf"]:
        if "pattern" in option and find_refs(attribute_property_object) == []:
            anyOf.append(f"Regex({option.get('pattern')})")
        elif "type" in option and "pattern" not in option:
            if option.get("type") not in ["null", "None"]:
                anyOf.append(option.get("type"))
    if len(anyOf) > 1:
        return "Any of: " + ", ".join(anyOf), default
    elif len(anyOf) == 1:
        return anyOf[0], default


def handle_const(attribute_property_object: dict):
    default = attribute_property_object.get("default", "None")
    return "string", default


def handle_items(attribute_property_object: dict):
    default = attribute_property_object.get("default", "None")
    type = attribute_property_object.get("type")
    refs = find_refs(attribute_property_object.get("items", {}))
    if type == "array" and refs:
        return "Array of " + " or ".join(refs), default
    return type, default


def handle_discriminator(attribute_property_object: dict):
    default_key = attribute_property_object.get("discriminator", {}).get(
        "propertyName", ""
    )
    default_value = attribute_property_object.get("default", {}).get(default_key)
    default = (
        attribute_property_object.get("discriminator", {})
        .get("mapping", {})
        .get(default_value)
    )
    refs = find_refs(attribute_property_object.get("oneOf", []))
    if refs:
        return "One of:<br>  •" + "<br>  •".join(refs), default
    return "", default


def handle_default(attribute_property_object: dict):
    default = attribute_property_object.get("default", "None")
    type = attribute_property_object.get("type", "")
    return type, default


def handle_attribute_properties(model_defs: dict, attribute_property_object: dict):
    """Handle extracting type, description, default from different types of property objects that pydantic produces"""
    description = attribute_property_object.get("description", "")

    attribute_key_type = ".".join(list(attribute_property_object.keys()))
    if "allOf" in attribute_key_type:
        try:
            type, default = handle_allOf(attribute_property_object, model_defs)
        except Exception as e:
            print(f"attribute_key_type: {attribute_key_type}")
            print(f"attribute_property_object: {attribute_property_object}")
            raise e
    elif "anyOf" in attribute_key_type:
        type, default = handle_anyOf(attribute_property_object)
    elif "const" in attribute_key_type:
        type, default = handle_const(attribute_property_object)
    elif "items" in attribute_key_type:
        type, default = handle_items(attribute_property_object)
    elif "discriminator" in attribute_key_type:
        type, default = handle_discriminator(attribute_property_object)
    else:
        type, default = handle_default(attribute_property_object)

    default = default if default is not None else "None"

    return type, description, default


def from_pydantic_model(model_defs: dict, model_name: str) -> str:
    """Generates markdown from the model description and creates table of attributes from $defs in pydantic schema"""
    model_def = model_defs.get(model_name, {})
    if not model_def:
        raise KeyError(f"Schema missing model: {model_name}")
    model_properties = model_def.get("properties", {})
    model_md = (
        ""
        if not model_def.get("description", {})
        else dedent(model_def.get("description"))
    )
    md_table = "| Field | Type | Default | Description |\n|-------|------|---------|-------------|\n"

    for property_name, property_object in model_properties.items():
        field_type, field_description, field_default = handle_attribute_properties(
            model_defs, property_object
        )
        md_table += f"| {property_name} | {field_type} | {field_default} | {field_description} |\n"

    return f"# {model_name}" + "\n" + model_md + "\n## Attributes\n" + md_table


def _get_traceprop_nested_structure(
    model_defs: dict, model_name: str, details: list = []
) -> str:
    """Generates Trace Props reference dictionary that will later be converted into yaml for the md file"""
    model_properties = model_defs.get(model_name, {}).get("properties", {})
    if not model_properties:
        raise KeyError(
            f"Model {model_name} not found in model_defs dictionary passed into the function."
        )
    output = {}

    for field_name, field_info in model_properties.items():
        field_info_keys = ".".join(list(field_info.keys()))

        if "anyOf" in field_info_keys:
            refs = find_refs(field_info.get("anyOf", {}))
            if refs and len(refs) == 1:
                nested_model_name = refs[0].split("/")[-1]
                output[field_name], details = _get_traceprop_nested_structure(
                    model_defs, nested_model_name, details
                )
            elif refs and len(refs) > 1:
                raise NotImplementedError(
                    "Have not handled Traceprop attributes with multiple models referenced."
                )
            else:
                field_description = field_info.get("description", {})
                position = len(details) + 1
                type = field_description.split("<br>")[0].strip(" ")
                detail = field_description.split("<br>")[-1]
                if len(detail.strip()) > 0:
                    type = type + f" #({position})!"
                    detail_line = f"{position}. " + detail
                    details.append(detail_line)
                output[field_name] = type
        elif "const" in field_info_keys:
            output[field_name] = field_info.get("const")
        else:
            raise NotImplementedError(
                f"Have not yet handled properties with attributes {field_info_keys}"
            )

    return output, details


def from_traceprop_model(model_defs: dict, model_name: str) -> str:
    model_def = model_defs.get(model_name, {})
    if not model_def:
        raise KeyError(f"Schema missing model: {model_name}")
    model_md = (
        ""
        if not model_def.get("description", {})
        else dedent(model_def.get("description")) + "\n"
    )
    if model_name.lower() == 'layout':
        description = "These attributes apply to the `chart.layout` object.\n"
    else:
        description = f"These attributes apply to traces where `trace.props.type` is set to `{model_name.lower()}`. You would configure these attributes on the trace with the `trace.props` object.\n"
    nested_structure, details = _get_traceprop_nested_structure(
        model_defs, model_name, details=[]
    )
    if model_name.lower() == 'scatter':
        title = 'Scatter (line, area & scatter)'
    else: 
        title = model_name        
    yaml_doc = yaml.dump(nested_structure, default_flow_style=False)
    pattern = r"'([^'#]+) (\#\(.*?\)!)'"
    processed_yaml_doc = re.sub(pattern, r"'\1' \2", yaml_doc)
    if model_name.lower() != 'layout':
        includes = (
            "{!" + f" include-markdown '" f"reference/props-docs/{model_name.lower()}.md' " + "!}" 
        )
    else:
        includes = ""
    full_doc = (
        f"# {title} "
        + "\n"
        + includes
        + model_md
        + "{% raw %}\n"
        + "## Attributes\n"
        + description
        + "``` yaml\n"
        + processed_yaml_doc
        + "\n```\n\n"
        + "\n".join(details)
        + "\n{% endraw %}\n"
    )
    return full_doc
