from .mkdocs_utils.markdown import from_pydantic_model, from_traceprop_model, find_refs
from .mkdocs_utils.nav_configuration_generator import (
    mkdocs_pydantic_nav,
    get_model_to_page_mapping,
    get_model_to_path_mapping,
    find_path,
    get_using_path,
    replace_using_path,
)
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

    def update_mkdocs_yaml_configuration(self, mkdocs_yaml_object: dict) -> dict:
        mkdocs_nav = mkdocs_yaml_object.get("nav", {})
        if not mkdocs_nav:
            raise KeyError(
                "Expecting nav key in the mkdocs.yml file. Perhaps the schema was changed in an update?"
            )
        configuration_path = find_path(mkdocs_nav, "Configuration")
        if not configuration_path:
            raise LookupError(
                "'Configuration' key was not found anywhere in the mkdocs.nav object."
            )
        updated_mkdocs_nav = replace_using_path(
            mkdocs_nav, configuration_path, self.get_nav_configuration()
        )

        def add_line_area_links(updated_mkdocs_nav):
            """Modifies the mkdocs nav object to include links to the line and area pages from the scatter page."""
            scatter_path = find_path(updated_mkdocs_nav, 'Scatter')
            scatter_markdown_file = get_using_path(updated_mkdocs_nav, scatter_path)
            props_path = scatter_path[:-2]
            props_list = get_using_path(updated_mkdocs_nav, props_path)
            props_list += [
                {"Line": scatter_markdown_file},
                {"Area": scatter_markdown_file},
            ]
            props_list = sorted(props_list, key=lambda d: next(iter(d))) #sort by key alphabetically
            replace_using_path(updated_mkdocs_nav, props_path, props_list)
        add_line_area_links(updated_mkdocs_nav)
        mkdocs_yaml_object["nav"] = updated_mkdocs_nav
        return mkdocs_yaml_object

    def _replace_model_with_page(self, md: str) -> str:

        sorted_map = dict(
            sorted(
                self.model_to_page_map.items(),
                key=lambda item: len(item[0]),
                reverse=True,
            )
        )
        for def_string, page_string in sorted_map.items():
            if def_string in md:
                md = md.replace(def_string, page_string)
        return md

    def _get_trace_prop_models(self) -> list:
        """Helper function to get the list of trace prop models. Enables a better error if the model is not found."""
        trace_def = self.SCHEMA["$defs"].get("Trace")
        props = trace_def.get("properties").get("props")
        refs = list(set(find_refs(props)))
        trace_prop_models = [i.split("/")[-1] for i in refs]
        return trace_prop_models

    def get_md_content(self, model_name):
        path = self.model_to_path_map.get(model_name, {})
        trace_prop_models = self._get_trace_prop_models()
        if not path:
            raise KeyError(f"model {model_name} not found in project")
        if model_name in trace_prop_models:
            md = from_traceprop_model(self.SCHEMA["$defs"], model_name)
        elif model_name == "Layout":
            md = from_traceprop_model(self.SCHEMA["$defs"], model_name)
        else:
            md = from_pydantic_model(self.SCHEMA["$defs"], model_name)
        md = self._replace_model_with_page(md=md)
        return md
