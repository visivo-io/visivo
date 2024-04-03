import yaml
import json
import os
from pathlib import Path
import re
import click
from visivo.templates.render_yaml import render_yaml
from visivo.parsers.yaml_ordered_dict import YamlOrderedDict


def yml_to_dict(relative_path):
    with open(relative_path, "r") as file:
        yaml_dict = yaml.safe_load(Path(relative_path).read_text())
        return dict(yaml_dict)


def list_all_ymls_in_dir(path):
    dir_path = Path(path)
    file_paths = list(dir_path.rglob("*.yml")) + list(dir_path.rglob("*.yaml"))
    file_paths = [p for p in file_paths if os.path.isfile(p)]
    return file_paths


def json_to_dict(relative_path):
    with open(relative_path) as json_file:
        data = json.load(json_file)
    return dict(data)


def file_from_path(path):
    return str(path).split("/")[-1].split(".")[0]


def remove_file_from_path(path):
    return "/".join(str(path).split("/")[:-1])


def sql_to_string(path):
    with open(path, "r") as file:
        sqlFile = file.read()
    return sqlFile.strip().lower()


def extract_table_name_from_create(sql_string):
    create_statement = sql_string.replace("\n", " ").split(" as ")[0].strip()
    if "create" in create_statement:
        return create_statement.split(" ")[-1]
    else:
        return None


def listify(string_or_list):
    if isinstance(string_or_list, str):
        return [string_or_list]
    elif isinstance(string_or_list, list):
        return string_or_list
    elif string_or_list == None:
        return [None]
    else:
        raise ValueError("Passed object that was neither a string, list or None")


def error_if_true(bool: bool, message: str):
    if bool:
        raise Exception(message)


def extract_value_from_function(function_text, function_name):
    if function_text is None:
        return None
    pattern = r"{}\((.+)\)".format(re.escape(function_name))
    match = re.search(pattern, function_text)
    if not match:
        return None
    value = match.group(1)
    return value.strip()


def set_location_recursive_items(dictionary, file):
    if isinstance(dictionary, YamlOrderedDict):
        for key, value in dictionary._key_locs.items():
            dictionary._key_locs[key] = value.replace("<unicode string>", file)

        for key, value in dictionary._value_locs.items():
            dictionary._value_locs[key] = value.replace("<unicode string>", file)

        for key, value in dictionary.items():
            if isinstance(value, dict):
                set_location_recursive_items(value, file)
            if isinstance(value, list):
                for item in value:
                    set_location_recursive_items(item, file)


def load_yaml_file(file):
    with open(file, "r") as stream:
        template_string = stream.read()
        try:
            loaded = yaml.safe_load(render_yaml(template_string))
            set_location_recursive_items(loaded, str(file))
            return loaded
        except yaml.YAMLError as exc:
            if hasattr(exc, "problem_mark"):
                mark = exc.problem_mark
                error_location = f"Invalid yaml in project\n  Location: {str(file)}:{mark.line + 1}[{mark.column + 1}]\n  Issue: {exc.problem}"
                raise click.ClickException(error_location)
            else:
                raise click.ClickException(exc)
