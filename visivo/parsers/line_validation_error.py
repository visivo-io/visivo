from pydantic import ValidationError
from typing import List
from pathlib import Path
import yaml
import re


def find_multi_line_string_start(file_path, input_dict):
    with open(file_path, "r") as file:
        file_content = file.read()

    file_lines = re.sub(r"^[ \t-]+", "", file_content, flags=re.MULTILINE).split("\n")
    input_lines = re.sub(
        r"^[ \t-]+", "", yaml.dump(input_dict), flags=re.MULTILINE
    ).split("\n")
    if input_lines[-1] == "":
        input_lines.pop()

    input_lines_length = len(input_lines)
    for ind in (i for i, e in enumerate(file_lines) if e == input_lines[0]):
        if file_lines[ind : ind + input_lines_length] == input_lines:
            return ind + 1
    return -1


class LineValidationError(Exception):
    def __init__(self, validation_error: ValidationError, files: List[Path]):
        self.validation_error = validation_error
        self.files = files

    def get_line_message(self, error):
        if "input" in error:
            input_dict = None
            if isinstance(error["input"], dict) and len(error["input"]) > 0:
                input_dict = error["input"]
            if isinstance(error["input"], int) or isinstance(error["input"], str):
                input_dict = {}
                input_dict[error["loc"][-1]] = error["input"]

            if input_dict:
                for file in self.files:
                    line = find_multi_line_string_start(file, input_dict)
                    if line >= 0:
                        return f"    File: {file}, line: {line}\n"
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
