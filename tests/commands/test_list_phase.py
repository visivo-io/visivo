import io
from contextlib import redirect_stdout
from tests.factories.model_factories import (
    ProjectFactory,
    SourceFactory,
    SqlModelFactory,
    InsightFactory,
)
from visivo.commands.list_phase import list_phase


def test_list_phase_with_nested_objects():
    """Test the list_phase function with nested objects in the project structure"""
    source = SourceFactory(name="nested_source")
    model = SqlModelFactory(name="nested_model", source="${ ref(nested_source) }")
    insight = InsightFactory(name="nested_insight", model=model)

    project = ProjectFactory(
        sources=[source],
        models=[model],
        insights=[insight],
        dashboards=[],
    )

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
