import json
import os 
from contextlib import contextmanager
from visivo.models.project import Project

@contextmanager
def temp_env_var(key: str, value: str):
    """Temporarily set an environment variable and restore it after."""
    old_value = os.getenv(key)
    os.environ[key] = value
    try:
        yield
    finally:
        if old_value is not None:
            os.environ[key] = old_value
        else:
            del os.environ[key]

def generate_schema(cleaned=True):
    """Generate the project schema JSON.
    
    Args:
        cleaned: Whether to clean regex patterns from the schema
    """
    with temp_env_var("EXCLUDE_TRACE_PROPS", "False"):
        schema = Project.model_json_schema(by_alias=False)
        schema_string = json.dumps(schema)
        
        if cleaned:
            schema_string = schema_string.replace("?P<ref_name>", "")
            schema_string = schema_string.replace("?P<column_name>", "")
            schema_string = schema_string.replace("?P<query_statement>", "")
            
        return schema_string 