import json
from visivo.models.project import Project
from importlib.resources import files

from visivo.models.props.types import PropType


def generate_project_schema():
    schema = Project.model_json_schema(by_alias=False)
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema_string = json.dumps(schema)
    schema_string = schema_string.replace("?P<ref_name>", "")
    schema_string = schema_string.replace("?P<column_name>", "")
    schema_string = schema_string.replace("?P<query_statement>", "")
    schema_string = schema_string.replace("?P<query_string>", "")
    schema_string = schema_string.replace("?P<model_name>", "")
    schema_string = schema_string.replace("?P<property_path>", "")

    return schema_string


def generate_prop_types_schemas():
    """Generate schemas for all trace types"""
    schemas = {}
    for prop_type in PropType:
        schema_path = files("visivo.schema").joinpath(f"{prop_type.value}.schema.json")
        with open(schema_path) as f:
            schemas[prop_type.value.capitalize()] = json.load(f)
    return schemas


def generate_schema():
    """Generate both project and trace prop schemas"""
    project_schema = json.loads(generate_project_schema())

    prop_type_schemas = generate_prop_types_schemas()

    if "$defs" not in project_schema:
        project_schema["$defs"] = {}

    for prop_type, schema in prop_type_schemas.items():
        project_schema["$defs"][prop_type] = schema

    project_schema["$defs"]["Trace"]["properties"]["props"] = {
        "oneOf": [{"$ref": f"#/$defs/{trace_type}"} for trace_type in prop_type_schemas.keys()]
    }

    project_schema["$defs"]["Insight"]["properties"]["props"] = {
        "oneOf": [{"$ref": f"#/$defs/{insight_type}"} for insight_type in prop_type_schemas.keys()]
    }

    layout_schema = json.loads(files("visivo.schema").joinpath("layout.schema.json").read_text())
    project_schema["$defs"]["Layout"] = layout_schema
    project_schema["$defs"]["Trace"]["properties"]["layout"] = {"$ref": "#/$defs/Layout"}
    project_schema["$defs"]["Insight"]["properties"]["layout"] = {"$ref": "#/$defs/Layout"}

    # Move nested $defs to top level
    defs_to_add = {}
    for def_name, def_schema in project_schema["$defs"].items():
        if "$defs" in def_schema:
            # Add each nested def to top level if it doesn't exist
            for nested_def_name, nested_def_schema in def_schema["$defs"].items():
                if (
                    nested_def_name not in project_schema["$defs"]
                    and nested_def_name not in defs_to_add
                ):
                    defs_to_add[nested_def_name] = nested_def_schema
            # Remove the nested $defs
            del def_schema["$defs"]

    # Add all collected defs to top level
    project_schema["$defs"].update(defs_to_add)
    return json.dumps(project_schema)
