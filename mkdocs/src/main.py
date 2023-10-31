from mkdocs_click._extension import replace_command_docs


def define_env(env):
    def render_click_docs(has_attr_list=False, options={}):
        """Generates Click markdown docs via macro rather than markdown extension"""
        docs = replace_command_docs(has_attr_list, **options)
        str_docs = "\n".join(list(docs))
        return str_docs

    env.macro(render_click_docs, "render_click_docs")
