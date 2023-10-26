from visivo.parsers.mkdocs import Mkdocs
from mkdocs_click._extension import replace_command_docs

mkdocs = Mkdocs()

def define_env(env):
    def pydantic_model_to_md_table(model_name: str):
        return mkdocs.get_md_content(model_name.capitalize())
    
    env.macro(pydantic_model_to_md_table, "render_pydantic_model")

    def render_click_docs( has_attr_list= False, options= {}):
        """Generates Click markdown docs via macro rather than markdown extension"""
        docs = replace_command_docs( has_attr_list, **options )
        str_docs = '\n'.join(list(docs))
        return str_docs

    env.macro(render_click_docs, "render_click_docs")

    def pydantic_trace_props_model_to_md(model_name: str):
        return mkdocs.get_md_content(model_name.capitalize()).replace('```', '')
    
    env.macro(pydantic_trace_props_model_to_md, "render_pydantic_trace_props_model")