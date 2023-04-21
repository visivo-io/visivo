import os
import yaml
import jinja2
from typing import List
from pathlib import Path
from pydantic import ValidationError
from ..models.project import Project

PROJECT_FILE_NAME = "visivo_project.yml"
PROFILE_FILE_NAME = "profile.yml"


class CoreParser:
    def __init__(self, files: List[Path]):
        self.files = files

    def parse(self) -> Project:
        try:
            return self.__build_project()
        except ValidationError as e:
            print("Error parsing base project")
            print(e)

    def data_by_name(self, name):
        file = next((f for f in self.files if f.name == name), None)
        if file == None:
            return {}

        def env_var(key):
            return os.getenv(key, "NOT-SET")

        with open(file, "r") as stream:
            template_string = stream.read()
            template = jinja2.Template(template_string)
            return yaml.safe_load(template.render({"env_var": env_var}))

    def __build_project(self):
        data = self.__merged_project_data()
        project = Project(**data)
        return project

    def __merged_project_data(self):
        project_data = self.data_by_name(PROJECT_FILE_NAME)
        profile_data = self.data_by_name(PROFILE_FILE_NAME)

        for key_to_merge in ["targets"]:
            if key_to_merge in profile_data:
                for profile_target in profile_data[key_to_merge]:
                    if not self.__dicts_contains_name(
                        project_data[key_to_merge], profile_target["name"]
                    ):
                        project_data[key_to_merge].append(profile_target)
        return project_data

    def __dicts_contains_name(self, dicts: List[dict], name):
        return next((d for d in dicts if d["name"] == name), None)
