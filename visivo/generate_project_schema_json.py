import os
import json
from visivo.utils import SCHEMA_FILE
from visivo.logging.logger import Logger
from importlib import reload, import_module

"""
Generates the project schema json file for the current version of the CLI. 

The generated file is shipped with visivo installs and is used in the Viewer to 
validate schema client side and to power flask app api endpoints. 
"""


def generate_schema():
    # Store original environment state

    trace_module = import_module("visivo.models.trace")
    reload(trace_module)

    project_module = import_module("visivo.models.project")
    reload(project_module)

    Project = project_module.Project

    # Generate schema with complete properties
    schema = Project.model_json_schema(by_alias=False)
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema_string = json.dumps(schema)

    schema_string = schema_string.replace('\\"', "")
    schema_string = schema_string.replace("?P<ref_name>", "")
    schema_string = schema_string.replace("?P<column_name>", "")
    schema_string = schema_string.replace("?P<query_statement>", "")
    schema_string = schema_string.replace("?P<query_string>", "")

    if "?P<" in schema_string:
        raise Exception(
            f"Schema json contains '?P<': this means that the schema is likely not JS compatible and needs a new find and replace like the ones above this line"
        )

    return schema_string


def write_schema_json() -> None:
    """
    Write the Visivo Project schema for the current CLI version to the output directory
    if it doesn't exist for the current verison of visivo.

    Args:
        output_dir: Directory to write schema file
    """

    try:
        Logger.instance().info(f"Generating schema file: {SCHEMA_FILE}...")

        schema = generate_schema()
        with open(SCHEMA_FILE, "w") as f:
            f.write(schema)
        Logger.instance().info(f"Schema file written to: {SCHEMA_FILE}")
    except Exception as e:
        Logger.instance().error(f"Error writing schema file: {str(e)}")
        raise e


if __name__ == "__main__":
    write_schema_json()
