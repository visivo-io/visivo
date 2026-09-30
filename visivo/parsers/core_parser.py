import click
from deepmerge import always_merger
from typing import Dict, List
from pathlib import Path
from pydantic import ValidationError
from visivo.parsers.line_validation_error import LineValidationError
from visivo.parsers.yaml_ordered_dict import setup_yaml_ordered_dict
from visivo.utils import load_yaml_file, PROJECT_CHILDREN
from visivo.models.project import Project


class CoreParser:
    def __init__(self, project_file: Path, files: List[Path], default_source: str = None):
        self.files = files
        self.project_file = project_file
        self.default_source = default_source
        setup_yaml_ordered_dict()

    def parse(self) -> Project:
        return self.__build_project()

    def merge_data_files(self):
        return self.__merged_project_data()

    def project_file_data(self):
        return load_yaml_file(self.project_file)

    def __build_project(self):
        data = self.__merged_project_data()
        data["project_file_path"] = str(self.project_file)
        if self.default_source:
            if "defaults" not in data or data["defaults"] is None:
                data["defaults"] = {}
            data["defaults"]["source_name"] = self.default_source
        try:
            project = Project(**data)
        except ValidationError as validation_error:
            raise LineValidationError(validation_error=validation_error, files=self.files)
        return project

    def __merged_project_data(self):
        project_data = self.project_file_data()
        self.__inline_template_files(project_data, self.project_file)

        data_files = {}
        for file in self.files:
            if file == self.project_file:
                continue
            data_files[file] = load_yaml_file(file)
            self.__inline_template_files(data_files[file], file)

        return self.__merge_data_into_project(project_data=project_data, data_files=data_files)

    def __merge_data_into_project(self, project_data: dict, data_files: dict):
        for index, (file_path, data_file) in enumerate(data_files.items()):
            for key_to_merge in PROJECT_CHILDREN.copy():
                if key_to_merge in data_file:
                    base_merge = []
                    if key_to_merge in project_data:
                        base_merge = project_data[key_to_merge]
                        if index == 0:
                            self.__recursively_add_file_path(base_merge, self.project_file)
                    file_to_merge = data_file[key_to_merge]
                    self.__recursively_add_file_path(file_to_merge, file_path)
                    project_data[key_to_merge] = always_merger.merge(base_merge, file_to_merge)
        return project_data

    def __inline_template_files(self, file_data, file_path):
        """Read each template dashboard's `template_file` into `template`, relative to the
        YAML file declaring it. The file name is kept so the source stays traceable."""
        if not isinstance(file_data, dict):
            return
        for dashboard in file_data.get("dashboards") or []:
            if not isinstance(dashboard, dict) or not dashboard.get("template_file"):
                continue
            name = dashboard.get("name", "(unnamed)")
            if dashboard.get("template") is not None:
                raise click.ClickException(
                    f"Dashboard '{name}' in {file_path} sets both `template` and "
                    "`template_file`; set one or the other."
                )
            template_path = Path(file_path).parent / dashboard["template_file"]
            try:
                dashboard["template"] = template_path.read_text(encoding="utf-8")
            except OSError as error:
                raise click.ClickException(
                    f"Dashboard '{name}' in {file_path}: could not read template_file "
                    f"'{dashboard['template_file']}' ({error.strerror or error})."
                )

    def __recursively_add_file_path(self, obj, file_path: str):
        """
        Modifies the input object by adding the file path to the named model objects.
        """
        if isinstance(obj, dict):
            if obj.get("name") is not None:
                obj["file_path"] = str(file_path)
            for value in obj.values():
                self.__recursively_add_file_path(value, file_path)
        elif isinstance(obj, list):
            for item in obj:
                self.__recursively_add_file_path(item, file_path)
        else:
            pass
