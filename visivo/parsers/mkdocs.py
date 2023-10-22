from .mkdocs_utils.markdown import from_pydantic_model, from_traceprop_model
from .mkdocs_utils.nav_configuration_generator import mkdocs_pydantic_nav, from_traceprop_model
from .schema_generator import generate_schema
import json


class Mkdocs:
    SCHEMA = json.loads(generate_schema())
    
    def get_model_object(self, model_name: str):
        return self.SCHEMA.get(model_name)
