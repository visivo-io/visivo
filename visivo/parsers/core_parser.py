from deepmerge import always_merger
from typing import Dict, List
from pathlib import Path
from pydantic import ValidationError
from visivo.parsers.line_validation_error import LineValidationError
from visivo.parsers.yaml_ordered_dict import setup_yaml_ordered_dict
from visivo.utils import load_yaml_file, PROJECT_CHILDREN
from visivo.models.project import Project


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
        data["project_file_path"] = str(self.project_file)
        try:
            project = Project(**data)
        except ValidationError as validation_error:
            raise LineValidationError(validation_error=validation_error, files=self.files)
        return project

    def __merged_project_data(self):
        project_data = self.project_file_data()
        self.__recursively_add_file_path(project_data, self.project_file)
        data_files = {}
        for file in self.files:
            if file == self.project_file:
                continue
            data_files[file] = load_yaml_file(file)

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

    def __recursively_add_file_path(self, obj, file_path: str):
        """
        Modifies the input object by adding the file path to the named model objects.
        """
        parent_dir = file_path.parent

        if isinstance(obj, dict):
            if obj.get("name") is not None:
                if obj.get("name") in PROJECT_CHILDREN:
                    obj["file_path"] = str(file_path)

            if obj.get("type", "").lower() in {"duckdb", "sqlite"}:
                db_path = obj.get("database")
                if isinstance(db_path, str):
                    obj["database"] = self.__resolve_path_if_relative(db_path, parent_dir)

            if "args" in obj and isinstance(obj["args"], list):
                new_args = []
                for arg in obj["args"]:
                    if isinstance(arg, str) and arg.endswith(".py"):
                        arg = self.__resolve_path_if_relative(arg, parent_dir)
                    new_args.append(arg)
                obj["args"] = new_args

            for value in obj.values():
                self.__recursively_add_file_path(value, file_path)
        elif isinstance(obj, list):
            for item in obj:
                self.__recursively_add_file_path(item, file_path)
        else:
            pass

    def __resolve_path_if_relative(self, path: str, parent_dir: Path) -> str:
        """
        Resolve path relative to parent_dir if it's a likely filesystem path.
        """
        p = Path(path)

        if p.is_absolute():
            return str(p)

        # Only rewrite if it looks like a real filesystem file
        if path.lower().startswith("tmp"):
            return path

        if any(
            path.lower().endswith(ext)
            for ext in [".db", ".sqlite", ".duckdb", ".py", ".yaml", ".yml"]
        ):
            return str(parent_dir / p)

        return path
