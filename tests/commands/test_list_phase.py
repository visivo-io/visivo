import os
import json
from tests.factories.model_factories import (
    ProjectFactory,
    SourceFactory,
    SqlModelFactory,
    TraceFactory,
)
from tests.support.utils import temp_folder, temp_yml_file
from visivo.commands.list_phase import list_phase
from visivo.parsers.file_names import PROJECT_FILE_NAME
import io
from contextlib import redirect_stdout


def test_list_phase_with_nested_objects():
    """Test the list_phase function with nested objects in the project structure"""
    source = SourceFactory(name="nested_source")
    model = SqlModelFactory(name="nested_model", source=source)
    trace = TraceFactory(name="nested_trace", model=model)

    project = ProjectFactory(traces=[trace])

    # Test that objects are only listed once even if they appear in multiple places
    f = io.StringIO()
    with redirect_stdout(f):
        list_phase(project, "models")
    output = f.getvalue()
    assert output.count(" - nested_model") == 1

    f = io.StringIO()
    with redirect_stdout(f):
        list_phase(project, "sources")
    output = f.getvalue()
    assert output.count(" - nested_source") == 1
