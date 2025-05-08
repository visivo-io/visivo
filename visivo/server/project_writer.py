import json
import os
import ruamel.yaml
from copy import deepcopy

DELETE = object()


class SubDiff(dict):
    pass


def diff(old_dict, new_dict):
    updates = {}
    for key in new_dict:
        if key not in old_dict:
            updates[key] = new_dict[key]
        elif isinstance(new_dict[key], dict) and isinstance(old_dict[key], dict):
            sub_diff = diff(old_dict[key], new_dict[key])
            if sub_diff:
                updates[key] = SubDiff(sub_diff)
        elif isinstance(new_dict[key], list) and isinstance(old_dict[key], list):
            if old_dict[key] != new_dict[key]:
                updates[key] = new_dict[key]
        else:
            if old_dict[key] != new_dict[key]:
                updates[key] = new_dict[key]
    for key in old_dict:
        if key not in new_dict:
            updates[key] = DELETE
    return updates


# Apply diff
def apply_diff(target, diff):
    for key, value in diff.items():
        if value is DELETE:
            if key in target:
                del target[key]
        elif isinstance(value, SubDiff):
            if key in target and isinstance(target[key], dict):
                apply_diff(target[key], value)
            else:
                target[key] = value
        else:
            target[key] = value


class ProjectWriter:
    """
    This class is responsible for parsing the front end data store and writing changes to the project files.

    It's a three step process to write changes to the project files:

        1. Re-build the named child to reflect how the information sits in the project files.
        2. Run `update_file_contents` to make changes to project files using a special round trip yaml parser that preserves comments and spacing.
        3. Run `write` to write the changes to the project files.
    """

    def __init__(self, named_children: dict):
        self.named_children = named_children
        self.yaml = ruamel.yaml.YAML(typ="rt")
        self.yaml.indent(mapping=2, sequence=4, offset=2)
        self.yaml.preserve_quotes = True
        self.yaml.width = float("inf")
        self.files_to_write = self.__set_initial_files_to_write_map(named_children)

    def update_file_contents(self):
        for child_name, child_info in self.named_children.items():
            match child_info["status"]:
                case "Unchanged":
                    continue
                case "New":
                    self._new(child_name)
                case "Deleted":
                    self._delete(child_name)
                case "Moved":
                    self._move(child_name)
                case "Modified":
                    self._update(child_name)
                case "Renamed":
                    self._rename(child_name, child_name)

    def write(self):
        """
        Writes changes to all files that have been updated. Setting "typ='rt'" on
        init allows us to keep the original spacing, comments, etc.
        """
        for file, contents in self.files_to_write.items():
            with open(file, "w") as file:
                self.yaml.dump(contents, file)

    def _update(self, child_name: str):
        new_object = self._get_named_child_config(child_name)

        def recurse(current):
            if isinstance(current, dict):
                for key, value in current.items():
                    if isinstance(value, dict) and value.get("name") == child_name:
                        diff_result = diff(value, new_object)
                        apply_diff(value, diff_result)
                        return True
                    elif isinstance(value, (dict, list)):
                        if recurse(value):
                            return True
            elif isinstance(current, list):
                for item in current:
                    if isinstance(item, dict) and item.get("name") == child_name:
                        diff_result = diff(item, new_object)
                        apply_diff(item, diff_result)
                        return True
                    elif isinstance(item, (dict, list)):
                        if recurse(item):
                            return True
            return False

        file_path = self.named_children[child_name]["file_path"]
        # Modify the file contents in place to reflect the changes for the named child
        recurse(self.files_to_write[file_path])

    def _new(self, child_name: str):
        child_dict = self._get_named_child_config(child_name)
        file_path = self.named_children[child_name]["new_file_path"]
        type_key = self.named_children[child_name]["type_key"]

        if self.files_to_write[file_path].get(type_key) is None:
            self.files_to_write[file_path][type_key] = []
        # Inplace append the new child to the type key list
        self.files_to_write[file_path][type_key].append(child_dict)

    def _delete(self, child_name: str, replace_with_reference: bool = False):

        def recurse(current):
            # Handle dictionaries
            if isinstance(current, dict):
                for key, value in list(current.items()):  # Use list to safely iterate
                    if isinstance(value, dict) and value.get("name") == child_name:
                        if replace_with_reference:
                            current[key] = "${ref(" + f"{child_name}" + ")}"
                        else:
                            del current[key]
                        return True
                    elif isinstance(value, (dict, list)):
                        if recurse(value):
                            return True
            # Handle lists
            elif isinstance(current, list):
                for i, item in enumerate(current):
                    if isinstance(item, dict) and item.get("name") == child_name:
                        if replace_with_reference:
                            current[i] = "${ref(" + f"{child_name}" + ")}"
                        else:
                            del current[i]
                        return True
                    elif isinstance(item, (dict, list)):
                        if recurse(item):
                            return True
            return False

        file_path = self.named_children[child_name]["file_path"]
        # Modify the file contents in place to reflect the deletion of the named child
        recurse(self.files_to_write[file_path])

    def _move(self, child_name: str):
        """
        Moving files is just a combination of deleting a file and then creating a new one.
        If the new file path is the same as the old file path, it will move the named child to
        a flat list in the project file.
        """
        # Check if the object is defined inline by looking at its config
        is_inline = self.named_children[child_name].get("is_inline_defined", False)

        self._delete(child_name, replace_with_reference=is_inline)
        self._new(child_name)

    def _rename(self, old_child_name: str, new_child_name: str):
        """Find and replace the old child name with the new child name in all file refs & in the named_child"""
        raise NotImplementedError("Rename is not implemented yet.")

    def _get_named_child_config(self, named_child_name: str) -> dict:
        """
        Returns the reconstructed config for a named child.
        """
        if named_child_name not in self.named_children:
            raise ValueError(
                f"Named child {named_child_name} not found in named_children dictionary."
            )
        return self.__reconstruct_named_child_config(
            self.named_children[named_child_name].get("config")
        )

    def __reconstruct_named_child_config(self, named_child_config: dict) -> dict:
        """ "
        This function will recursivly reconstruct a named child and return a config dictionary with the
        references and inline children returned to the original form found in the file.

        """

        def reconstruct_config(obj) -> dict:
            if isinstance(obj, dict):
                return {k: reconstruct_config(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [reconstruct_config(item) for item in obj]
            elif isinstance(obj, str):
                # if the string is a json string with a key of is_inline_defined, return the parsed json
                try:
                    parsed_json = json.loads(obj)
                    if isinstance(parsed_json, dict) and "is_inline_defined" in parsed_json:
                        if parsed_json["is_inline_defined"]:
                            inline_child_object = deepcopy(self.named_children[parsed_json["name"]])
                            inline_config = inline_child_object.get("config")
                            return reconstruct_config(inline_config)
                        else:
                            if parsed_json.get("original_value") is None:
                                raise ValueError(
                                    f"Inline defined named child {parsed_json['name']} does not have an original value set."
                                )
                            else:
                                # return the original reference value so that it matches the original file
                                return parsed_json.get("original_value")
                    else:
                        return obj
                except json.JSONDecodeError:
                    # if the string is not a json string, return the original string
                    return obj
            else:
                # if the object is not a string, return the original object
                return obj

        return reconstruct_config(named_child_config)

    def __set_initial_files_to_write_map(self, named_children: dict) -> dict:

        relevant_files = []
        for value in named_children.values():
            if value.get("status") == "Unchanged":
                continue
            else:
                relevant_files.append(value.get("file_path"))
                relevant_files.append(value.get("new_file_path"))
        relevant_files = [x for x in list(set(relevant_files)) if x is not None]
        files_to_write = {}

        for file_path in relevant_files:
            if file_path is None:
                continue
            elif os.path.isfile(file_path):
                with open(file_path, "r") as file:
                    file_contents = self.yaml.load(file)
                    files_to_write[file_path] = file_contents
            else:
                with open(file_path, "w") as file:
                    file.write("")
                files_to_write[file_path] = {}
        return files_to_write
