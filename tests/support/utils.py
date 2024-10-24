from pathlib import Path
import ruamel.yaml
import uuid
import os


def temp_folder():
    return f"tmp/{str(uuid.uuid1())}"


def temp_file(name: str, contents: str, output_dir: str = temp_folder()):
    os.makedirs(output_dir, exist_ok=True)
    path = f"{output_dir}/{name}"
    with open(path, "w") as file:
        file.write(contents)
    return Path(path)


def temp_yml_file(dict, name=str(uuid.uuid1()) + ".yml", output_dir=temp_folder()):
    yaml = ruamel.yaml.YAML()
    yaml.preserve_quotes = True
    os.makedirs(output_dir, exist_ok=True)
    path = f"{output_dir}/{name}"
    with open(path, "w") as file:
        yaml.dump(dict, file)
    return Path(path)
