from visivo.parsers.mkdocs import Mkdocs
import os
import shutil
import yaml

"""Iterate through mkdocs_pydantic_nav creating files at the specified paths. Write files with the correct model macro """


class CustomDumper(yaml.Dumper):
    def increase_indent(self, flow=False, indentless=False):
        return super(CustomDumper, self).increase_indent(flow, False)


mkdocs = Mkdocs()


def write_file(file_path, content):
    output_dir = os.path.dirname(file_path)
    os.makedirs(output_dir, exist_ok=True)
    with open(file_path, "w") as f:
        f.write(content)


def modify_mkdocs_yaml():
    """Read mkdocs yaml, get nav.reference.configuration """
    if not os.path.isfile("mkdocs.yml"):
        raise FileNotFoundError(
            f"Script expects mkdocs.yml to be present in the working directory {os.getcwd()}"
        )
    with open("mkdocs.yml", "r") as file:
        mkdocs_yaml_object = yaml.safe_load(file)
    updated_mkdocs_yaml_object = mkdocs.update_mkdocs_yaml_configuration(
        mkdocs_yaml_object
    )
    with open("mkdocs.yml", "w") as file:
        yaml.dump(
            updated_mkdocs_yaml_object,
            file,
            default_flow_style=False,
            sort_keys=False,
            Dumper=CustomDumper,
        )


def write_pydantic_md_files():
    configuration_path = "mkdocs/reference/configuration"
    if os.path.isdir(configuration_path):
        shutil.rmtree(configuration_path)
    for model, path in mkdocs.model_to_path_map.items():
        content = mkdocs.get_md_content(model_name=model)
        write_file(path, content)


if __name__ == "__main__":
    modify_mkdocs_yaml()
    write_pydantic_md_files()
