from .mkdocs_utils.markdown import from_pydantic_model, from_traceprop_model
from .mkdocs_utils.nav_configuration_generator import mkdocs_pydantic_nav, get_model_to_page_mapping, get_model_to_path_mapping
from .schema_generator import generate_schema
import json


class Mkdocs:
    """Holds SCHEMA state so that upstream scripts only need to run that import once."""
    SCHEMA = json.loads(generate_schema())
    nav_configuration = mkdocs_pydantic_nav(SCHEMA)
    model_to_page_map = get_model_to_page_mapping(nav_configuration)
    model_to_path_map = get_model_to_path_mapping(nav_configuration)

    def get_model_object(self, model_name: str):
        return self.SCHEMA.get(model_name)
    
    def get_nav_configuration(self):
        return self.nav_configuration

    def get_docs_content(self, model_name):
        path = self.model_to_path_map.get('model_name', {})
        if not path:
            raise KeyError(f"model {model_name} not found in project")
        if path.split('/')[-3] == 'Trace':
            md = from_traceprop_model(model_name)
        else:
            md = from_pydantic_model(self.SCHEMA['$defs'], model_name)
        
        for def_string, page_string in self.model_to_page_map.items():
            md.replace(def_string, page_string)

        return md 

        