import json
import os 
from importlib import reload, import_module

def generate_schema(cleaned=True):
    # Store original environment state
    PASSED_EXCLUDE_TRACE_PROPS = os.getenv("EXCLUDE_TRACE_PROPS")
    
    # Force complete property loading
    os.environ["EXCLUDE_TRACE_PROPS"] = "False"
    
    # Import and reload all necessary modules in the correct order
    trace_props_module = import_module('visivo.models.trace_props.fields')
    reload(trace_props_module)
    
    trace_module = import_module('visivo.models.trace')
    reload(trace_module)
    
    project_module = import_module('visivo.models.project')
    reload(project_module)
    
    Project = project_module.Project
    
    # Generate schema with complete properties
    schema = Project.model_json_schema(by_alias=False)
    schema_string = json.dumps(schema)
    
    if cleaned:
        schema_string = schema_string.replace("?P<ref_name>", "")
        schema_string = schema_string.replace("?P<column_name>", "")
        schema_string = schema_string.replace("?P<query_statement>", "")

    # Restore original environment state
    if PASSED_EXCLUDE_TRACE_PROPS is not None:
        os.environ["EXCLUDE_TRACE_PROPS"] = PASSED_EXCLUDE_TRACE_PROPS
    else:
        del os.environ["EXCLUDE_TRACE_PROPS"]
        
    return schema_string
