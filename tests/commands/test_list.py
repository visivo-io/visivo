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
    TraceFactory,
)

runner = CliRunner()


def test_list():
    """Test the list command with different object types"""
    # Create a project with test objects
    source = SourceFactory(name="test_source")
    model = SqlModelFactory(name="test_model", source="${ ref(test_source) }")
    trace = TraceFactory(name="test_trace", model="${ ref(test_model) }")
    project = ProjectFactory(sources=[source], models=[model], traces=[trace], dashboards=[])

    # Create a temporary project file
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

    # Test listing traces
    response = runner.invoke(list, ["traces", "-w", working_dir])
    assert "traces:" in response.output
    assert " - test_trace" in response.output
    assert response.exit_code == 0
