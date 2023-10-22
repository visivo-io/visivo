from visivo.parsers.mkdocs.nav_configuration_generator import mkdocs_pydantic_nav
import yaml


print(yaml.dump(mkdocs_pydantic_nav(), default_flow_style=False))
"""Iterate through mkdocs_pydantic_nav creating files at the specified paths. Write files with the correct model macro """ 