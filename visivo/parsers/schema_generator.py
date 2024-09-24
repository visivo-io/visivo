import json
from visivo.models.project import Project


def generate_schema():
    schema = Project.model_json_schema(by_alias=False)
    schema_string = json.dumps(schema)
    schema_string = schema_string.replace("?P<ref_name>", "")
    schema_string = schema_string.replace("?P<column_name>", "")
    schema_string = schema_string.replace("?P<query_statement>", "")

    return schema_string
