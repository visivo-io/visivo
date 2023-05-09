from pathlib import Path
import yaml
import uuid
import os


def temp_folder():
    return f"tmp/{str(uuid.uuid1())}"


def temp_file(name:str, contents: str):
    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)
    path = f"{output_dir}/{name}"
    file = open(path, "w")
    file.write(contents)
    file.close()
    return Path(path)


def temp_yml_file(dict, name=str(uuid.uuid1()) + ".yml"):
    path = f"tmp/{str(uuid.uuid1())}/{name}"
    folders = os.path.dirname(path)
    os.makedirs(folders, exist_ok=True)

    fp = open(path, "w")
    fp.write(yaml.dump(dict))
    fp.close()

    return Path(path)


