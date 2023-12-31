from pydantic import ValidationError
from typing import List
from pathlib import Path
import yaml
import re


def find_multi_line_string_start(file_path, input_dict):
    with open(file_path, "r") as file:
        file_content = file.read()

    file_lines = re.sub(r"^[\s-]+", "", file_content, flags=re.MULTILINE).split("\n")
    input_lines = re.sub(
        r"^[\s-]+", "", yaml.dump(input_dict), flags=re.MULTILINE
    ).split("\n")
    if input_lines[-1] == "":
        input_lines.pop()

    for i, line in enumerate(file_lines, start=1):
        if line == input_lines[0]:
            match = True
            for j in range(1, len(input_lines)):
                if i + j >= len(file_lines) or file_lines[i + j] != input_lines[j]:
                    match = False
                    break

            if match:
                return i

    return -1


class LineValidationError(Exception):
    def __init__(self, validation_error: ValidationError, files: List[Path]):
        self.validation_error = validation_error
        self.files = files

    def get_location(self, error):
        if (
            "input" in error
            and isinstance(error["input"], dict)
            and len(error["input"]) > 0
        ):
            input_dict = error["input"]
            for file in self.files:
                line = find_multi_line_string_start(file, input_dict)
                return f"    File: {file}, line: {line}\n"
        return None

    def __str__(self):
        message = f"{self.validation_error.error_count()} validation errors in {self.validation_error.title}\n"
        file_found = False
        for error in self.validation_error.errors():
            message = message + f"{'.'.join(map(lambda l: str(l), error['loc']))}\n"
            message = message + f"  {error['msg']}'\n"
            line_message = self.get_location(error)
            if line_message:
                file_found = True
                message = message + f"  The input used ({error['input']}) was found: \n"
                message = message + line_message
            else:
                message = message + f"  The input used: ({error['input']})\n"

        if file_found:
            return message
        else:
            return str(self.validation_error)
