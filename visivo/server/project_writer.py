import json
import yaml
from copy import deepcopy

class ProjectNamedChildrenWriter:
    def __init__(self, named_children, project_file_path):
        self.named_children = named_children
        self.project_file_path = project_file_path
        self.files_to_write = self.__set_initial_files_to_write_map(named_children)
    
    def update(self, named_child: str):
        pass

    def new(self, named_child: str):
        child_dict = self.named_children[named_child]
        file_path = child_dict["file_path"]

        pass

    def delete(self, named_child: str):
        pass

    def move(self, named_child: str):
        self.delete(named_child)
        self.new(named_child)

    def __write(self):
        """ 
        Need to find a way to write back to the file while maintaining whatever spacing they were using
        in their project to avoid frivolous git diffs. 

        """
        for file, contents in self.files_to_write.items(): 
            with open(file, 'w') as file:
                yaml.dump(contents, file)

    def reconstruct_named_child_config(self, named_child_config: dict) -> dict:
        """"
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
                    if isinstance(parsed_json, dict) and 'is_inline_defined' in parsed_json:
                        if parsed_json["is_inline_defined"]:
                            inline_child_object = deepcopy(self.named_children[parsed_json["name"]])
                            inline_config = inline_child_object.get("config")
                            return reconstruct_config(inline_config)
                        else:
                            if parsed_json.get("original_value") is None:
                                raise ValueError(f"Inline defined named child {parsed_json['name']} does not have an original value set.")
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
                    
            

    @staticmethod
    def __set_initial_files_to_write_map(named_children: dict) -> dict:
        import yaml
        import os 

        relevant_files = []
        for value in named_children.values():
            if value.get("status") == "Unchanged":
                continue
            else: 
                relevant_files.append(value.get("file_path"))
                relevant_files.append(value.get("new_file_path"))
        relevant_files = list(set(relevant_files))
        
        files_to_write = {}
        for file_path in relevant_files:
            if os.path.isfile(file_path):
                with open(file_path, "r") as file:
                    file_contents = yaml.safe_load(file)
                    files_to_write[file_path] = file_contents
            else: 
                with open (file_path, "w") as file: 
                    file.write("")
                files_to_write[file_path] = {}
        return files_to_write

    def __merge_dictionary_updates(self, base_dict, updates_dict):
        """
        Function needs to find the named object in the file dictionary recursively. 
        Then we can use the path that we found to replace the current object with the modified one.

        I think for new objects we need a different process. Deletions seem like the same thing since were just 
        """
        pass     
