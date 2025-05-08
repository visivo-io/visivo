from pathlib import Path
from tests.support.utils import temp_file, temp_folder
from pydantic import ValidationError, BaseModel, ConfigDict
import pytest
import os
import yaml
from visivo.models.project import Project

from visivo.parsers.line_validation_error import LineValidationError
from visivo.parsers.yaml_ordered_dict import setup_yaml_ordered_dict


class Missing(BaseModel):
    model_config = ConfigDict(extra="forbid")
    required: str
    other_required: str


def test_found_line_number():
    setup_yaml_ordered_dict()
    output_dir = temp_folder()
    file = temp_file(
        contents="\n" + yaml.dump({"model": {"required": "value"}}),
        output_dir=output_dir,
        name="model.yml",
    )
    with pytest.raises(ValidationError) as exc_info:
        with open(file, "r") as stream:
            Missing(**yaml.safe_load(stream))

    line_validation_error = LineValidationError(validation_error=exc_info.value, files=[file])

    assert ":3" in str(line_validation_error)


def test_found_int_line_number():
    setup_yaml_ordered_dict()
    output_dir = temp_folder()
    file = temp_file(
        contents=yaml.dump({"required": 1, "other_required": "value"}),
        output_dir=output_dir,
        name="model.yml",
    )
    with pytest.raises(ValidationError) as exc_info:
        with open(file, "r") as stream:
            Missing(**yaml.safe_load(stream))

    line_validation_error = LineValidationError(validation_error=exc_info.value, files=[file])

    assert ":2" in str(line_validation_error)


def test_extra_input_no_found_line_number():
    setup_yaml_ordered_dict()
    output_dir = temp_folder()
    file = temp_file(
        contents=yaml.dump({"required": "value", "other_required": "value", "z_extra": "value"}),
        output_dir=output_dir,
        name="model.yml",
    )
    with pytest.raises(ValidationError) as exc_info:
        with open(file, "r") as stream:
            Missing(**yaml.safe_load(stream))

    line_validation_error = LineValidationError(validation_error=exc_info.value, files=[file])

    assert ":3" in str(line_validation_error)
