from tests.support.utils import temp_file, temp_folder
from pydantic import ValidationError, BaseModel, ConfigDict
import pytest
import os
import yaml

from visivo.parsers.line_validation_error import LineValidationError


class TestMissing(BaseModel):
    model_config = ConfigDict(extra="forbid")
    required: str
    other_required: str


def test_found_line_number():
    output_dir = temp_folder()
    file = temp_file(
        contents=yaml.dump({"required": "value"}),
        output_dir=output_dir,
        name="model.yml",
    )
    with pytest.raises(ValidationError) as exc_info:
        TestMissing(required="value")

    line_validation_error = LineValidationError(
        validation_error=exc_info.value, files=[file]
    )

    assert ", line: 1" in str(line_validation_error)
