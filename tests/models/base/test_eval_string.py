from pydantic import Field
from tests.factories.model_factories import ProjectFactory
from visivo.models.base.base_model import BaseModel
import pytest

from visivo.models.base.eval_string import EvalString


class MockStringModel(BaseModel):
    eval: EvalString = Field(None, description="")


def test_EvalString_get_context_strings():
    context_string = EvalString(">{ }")
    assert context_string.get_context_strings() == []

    context_string = EvalString("> { ref(Name) }")
    assert context_string.get_context_strings() == []

    context_string = EvalString(">{ ${ ref(Name) } }")
    assert context_string.get_context_strings()[0].value == "${ ref(Name) }"

    context_string = EvalString(">{ ${ref(Name)} }")
    assert context_string.get_context_strings()[0].value == "${ref(Name)}"

    context_string = EvalString(">{ ${ ref(Name) } != ${ ref(Name 2) } }")
    assert context_string.get_context_strings()[0].value == "${ ref(Name) }"
    assert context_string.get_context_strings()[1].value == "${ ref(Name 2) }"

    context_string = EvalString(">{ ${ project.name } }")
    assert context_string.get_context_strings()[0].value == "${ project.name }"


def test_EvalString_as_field():
    test_string_model = MockStringModel(**{"eval": ">{ ${ ref(Name) } }"})
    assert test_string_model.eval.get_context_strings()[0].value == "${ ref(Name) }"

    with pytest.raises(ValueError):
        MockStringModel(**{"eval": "{ ref(Name) }"})


def test_evaluate():
    project = ProjectFactory()
    project.dashboards[0].rows[0].items[0].chart.traces[
        0
    ].path = "project.dashboards[0].rows[0].items[0].chart.traces[0]"
    project.dashboards[0].rows[0].items[
        0
    ].path = "project.dashboards[0].rows[0].items[0]"
    dag = project.dag()
    output_dir = "tmp"

    es = EvalString(">{ True }")
    assert es.evaluate(dag, project, output_dir) == True

    es = EvalString(">{ 2 + 3 * 4 }")
    assert es.evaluate(dag, project, output_dir) == 14

    es = EvalString(">{ 5 > 3 and 2 <= 2 }")
    assert es.evaluate(dag, project, output_dir) == True

    es = EvalString(">{ any_test_failed() }")
    assert es.evaluate(dag, project, output_dir) == False

    es = EvalString(">{ any_test_failed() == False }")
    assert es.evaluate(dag, project, output_dir) == True

    es = EvalString(">{ env.ENVIRONMENT == 'PRODUCTION' }")
    assert es.evaluate(dag, project, output_dir) == False

    es = EvalString(">{ ${ ref(project).name } == 'project' }")
    assert es.evaluate(dag, project, output_dir) == True

    es = EvalString(">{ ${ project.name } == 'project' }")
    assert es.evaluate(dag, project, output_dir) == True

    es = EvalString(">{ ${ project.dashboards[0].rows[0].items[0].name } == 'item' }")
    assert es.evaluate(dag, project, output_dir) == True

    es = EvalString(">{ ${ ref(trace).name } == 'trace' }")
    assert es.evaluate(dag, project, output_dir) == True

    with pytest.raises(
        ValueError,
        match="Invalid expression: .*: 'Dashboard' object has no attribute 'items'",
    ):
        es = EvalString(">{ ${ project.dashboards[0].items[0].name } == 'item' }")
        es.evaluate(dag, project, output_dir)

    with pytest.raises(
        ValueError,
        match="Invalid expression: .*: list index out of range",
    ):
        es = EvalString(">{ ${ project.dashboards[1].name } == 'item' }")
        es.evaluate(dag, project, output_dir)

    with pytest.raises(ValueError):
        EvalString(">{ unsupported_function() }").evaluate(dag, project, output_dir)

    with pytest.raises(ValueError):
        EvalString(">{ 1 + 'string' }").evaluate(dag, project, output_dir)
