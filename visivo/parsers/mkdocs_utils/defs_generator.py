from ..schema_generator import generate_schema
import json


def generate_defs() -> dict:
    schema = json.loads(generate_schema())
    defs = schema.get('$defs', {})
    if not defs:
        raise Exception(f"Schema is missing '$defs' key. Maybe pydantic made some breaking updates?")
    return defs 
