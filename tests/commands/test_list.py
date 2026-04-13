import os
from visivo.commands.list import list
from visivo.parsers.file_names import PROJECT_FILE_NAME
from tests.support.utils import temp_yml_file
import json
from click.testing import CliRunner
from tests.factories.model_factories import (
    ProjectFactory,
    SourceFactory,
    SqlModelFactory,
)

runner = CliRunner()


def test_list():
    """Test the list command with different object types"""
    source = SourceFactory(name="test_source")
    model = SqlModelFactory(name="test_model", source="${ ref(test_source) }")
    project = ProjectFactory(sources=[source], models=[model], dashboards=[])

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    # Test listing sources
    response = runner.invoke(list, ["sources", "-w", working_dir])
    assert "sources:" in response.output
    assert " - test_source" in response.output
    assert response.exit_code == 0

    # Test listing models
    response = runner.invoke(list, ["models", "-w", working_dir])
    assert "models:" in response.output
    assert " - test_model" in response.output
    assert response.exit_code == 0
