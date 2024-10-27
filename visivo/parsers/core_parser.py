from deepmerge import always_merger
from typing import List
from pathlib import Path
from pydantic import ValidationError
from visivo.parsers.line_validation_error import LineValidationError
from visivo.parsers.yaml_ordered_dict import setup_yaml_ordered_dict
from visivo.utils import load_yaml_file
from ..models.project import Project


class CoreParser:
    def __init__(self, project_file: Path, files: List[Path]):
        self.files = files
        self.project_file = project_file
        setup_yaml_ordered_dict()

    def parse(self) -> Project:
        return self.__build_project()

    def merge_data_files(self):
        return self.__merged_project_data()

    def project_file_data(self):
        return load_yaml_file(self.project_file)

    def __build_project(self):
        data = self.__merged_project_data()
        try:
            project = Project(**data)
        except ValidationError as validation_error:
            raise LineValidationError(
                validation_error=validation_error, files=self.files
            )
        return project

    def __merged_project_data(self):
        project_data = self.project_file_data()

        data_files = []
        for file in self.files:
            if file == self.project_file:
                continue
            data_files.append(load_yaml_file(file))

        return self.__merge_data_into_project(
            project_data=project_data, data_files=data_files
        )

    def __merge_data_into_project(self, project_data: dict, data_files: List[dict]):
        keys_to_merge = [
            "alerts",
            "selectors",
            "sources",
            "models",
            "traces",
            "tables",
            "charts",
            "dashboards",
        ]
        for data_file in data_files:
            for key_to_merge in keys_to_merge:
                if key_to_merge in data_file:
                    base_merge = []
                    if key_to_merge in project_data:
                        base_merge = project_data[key_to_merge]
                    project_data[key_to_merge] = always_merger.merge(
                        base_merge, data_file[key_to_merge]
                    )
        return project_data
