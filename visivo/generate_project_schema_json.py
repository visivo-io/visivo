from pathlib import Path

from visivo.utils import SCHEMA_FILE
from visivo.logger.logger import Logger
from importlib import reload, import_module
from visivo.parsers.schema_generator import generate_schema

"""
Generates the project schema json file for the current version of the CLI. 

The generated file is shipped with visivo installs and is used in the Viewer to 
validate schema client side and to power flask app api endpoints. 
"""


def reload_and_generate_schema():
    project_module = import_module("visivo.models.project")
    reload(project_module)

    schema_string = generate_schema()
    if "?P<" in schema_string:
        raise Exception(
            f"Schema json contains '?P<': this means that the schema is likely not JS compatible and needs a new find and replace like the ones above this line"
        )

    return schema_string


# Only present in a source checkout; an installed package has no viewer sources.
VIEWER_SCHEMA_FILE = (
    Path(__file__).resolve().parent.parent
    / "viewer"
    / "src"
    / "schemas"
    / "visivo_project_schema.json"
)


def write_schema_json() -> None:
    """Write the Visivo Project schema for the current CLI version, and the viewer's
    copy of it when the viewer sources are here."""

    try:
        Logger.instance().info(f"Generating schema file: {SCHEMA_FILE}...")

        schema = reload_and_generate_schema()
        targets = [SCHEMA_FILE]
        if VIEWER_SCHEMA_FILE.parent.is_dir():
            targets.append(VIEWER_SCHEMA_FILE)
        for target in targets:
            with open(target, "w") as f:
                f.write(schema)
            Logger.instance().info(f"Schema file written to: {target}")
    except Exception as e:
        Logger.instance().error(f"Error writing schema file: {str(e)}")
        raise e


if __name__ == "__main__":
    write_schema_json()
