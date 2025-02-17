import os
from visivo.utils import get_schema_file_name
from visivo.logging.logger import Logger
from importlib.metadata import version
from visivo.parsers.schema_generator import generate_schema

def write_schema_if_not_exists_for_current_version(output_dir: str) -> None:
    """
    Write the Visivo Project schema for the current CLI version to the output directory if it doesn't exist for the current verison of visivo.
    
    Args:
        output_dir: Directory to write schema file
    """
    current_version = version("visivo")
    schema_filename = get_schema_file_name(current_version)
    schema_path = os.path.join(output_dir, schema_filename)

    try:
        if not os.path.exists(schema_path):
            Logger.instance().info(f"Generating schema file: {schema_filename}")

            schema = generate_schema(cleaned=False)
            with open(schema_path, 'w') as f:
                f.write(schema)
            Logger.instance().info(f"Schema file written to: {schema_path}")
    except Exception as e:
        Logger.instance().error(f"Error writing schema file: {str(e)}")
        raise e