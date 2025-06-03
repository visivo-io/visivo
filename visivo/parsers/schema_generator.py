import json
from visivo.models.project import Project
from visivo.models.trace_props.trace_props import TraceType
from importlib.resources import files


def generate_project_schema():
    schema = Project.model_json_schema(by_alias=False)
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema_string = json.dumps(schema)
    schema_string = schema_string.replace("?P<ref_name>", "")
    schema_string = schema_string.replace("?P<column_name>", "")
    schema_string = schema_string.replace("?P<query_statement>", "")
    schema_string = schema_string.replace("?P<query_string>", "")

    return schema_string


def generate_trace_prop_schemas():
    """Generate schemas for all trace types"""
    schemas = {}
    for trace_type in TraceType:
        schema_path = files("visivo.schema").joinpath(f"{trace_type.value}.schema.json")
        with open(schema_path) as f:
            schemas[trace_type.value.capitalize()] = json.load(f)
    return schemas


def generate_schema():
    """Generate both project and trace prop schemas"""
    project_schema = json.loads(generate_project_schema())

    trace_schemas = generate_trace_prop_schemas()

    if "$defs" not in project_schema:
        project_schema["$defs"] = {}

    for trace_type, schema in trace_schemas.items():
        project_schema["$defs"][trace_type] = schema

    project_schema["$defs"]["Trace"]["properties"]["props"] = {
        "oneOf": [{"$ref": f"#/$defs/{trace_type}"} for trace_type in trace_schemas.keys()]
    }
    layout_schema = json.loads(files("visivo.schema").joinpath("layout.schema.json").read_text())
    project_schema["$defs"]["Layout"] = layout_schema
    project_schema["$defs"]["Trace"]["properties"]["layout"] = {"$ref": "#/$defs/Layout"}

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
