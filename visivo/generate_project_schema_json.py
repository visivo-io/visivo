from visivo.utils import SCHEMA_FILE
from visivo.logging.logger import Logger
from importlib import reload, import_module
from visivo.parsers.schema_generator import generate_schema

"""
Generates the project schema json file for the current version of the CLI. 

The generated file is shipped with visivo installs and is used in the Viewer to 
validate schema client side and to power flask app api endpoints. 
"""


def reload_and_generate_schema():
    # Store original environment state

    trace_module = import_module("visivo.models.trace")
    reload(trace_module)

    project_module = import_module("visivo.models.project")
    reload(project_module)

    schema_string = generate_schema()
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

        schema = reload_and_generate_schema()
        with open(SCHEMA_FILE, "w") as f:
            f.write(schema)
        Logger.instance().info(f"Schema file written to: {SCHEMA_FILE}")
    except Exception as e:
        Logger.instance().error(f"Error writing schema file: {str(e)}")
        raise e


if __name__ == "__main__":
    write_schema_json()
