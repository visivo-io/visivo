from pydantic import ValidationError
from typing import List
from pathlib import Path
import yaml
import re

from visivo.parsers.yaml_ordered_dict import YamlOrderedDict


def find_line_string_start(file_path, input_dict):
    with open(file_path, "r") as file:
        file_content = file.read()

    file_lines = re.sub(r"^[ \t-]+", "", file_content, flags=re.MULTILINE).split("\n")
    input_line = re.sub(r"^[\s-]+", "", yaml.dump(input_dict), flags=re.MULTILINE)
    for line_number, file_line in enumerate(file_lines):
        if input_line in file_line:
            return line_number + 1
    return -1


class LineValidationError(Exception):
    def __init__(self, validation_error: ValidationError, files: List[Path]):
        self.validation_error = validation_error
        self.files = files

    def get_line_message(self, error):
        if "input" in error:
            if isinstance(error["input"], YamlOrderedDict) and len(error["input"]) > 0:
                return f"  File: {list(error['input']._key_locs.values())[0]}\n"
            if isinstance(error["input"], int) or isinstance(error["input"], str):
                input_dict = {}
                input_dict[error["loc"][-1]] = error["input"]

                for file in self.files:
                    line = find_line_string_start(file, input_dict)
                    if line >= 0:
                        return f"  File: {file}:{line}\n"
        return None

    def __str__(self):
        message = f"{self.validation_error.error_count()} validation errors in {self.validation_error.title}\n"
        file_found = False
        for error in self.validation_error.errors():
            message = message + f"{'.'.join(map(lambda l: str(l), error['loc']))}\n"
            message = message + f"  {error['msg']}\n"
            line_message = self.get_line_message(error)
            if line_message:
                file_found = True
                message = (
                    message + f"  The input used: ({error['input']}) was found: \n"
                )
                message = message + line_message
            else:
                message = message + f"  The input used: ({error['input']})\n"

        if file_found:
            return message
        else:
            return str(self.validation_error)
