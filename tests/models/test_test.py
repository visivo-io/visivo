from visivo.models.base.eval_string import EvalString
from visivo.models.test import OnFailureEnum, Test
from pydantic import ValidationError


def test_Test_missing_data():
    try:
        Test()
    except ValidationError as e:
        error = e.errors()[0]
        assert error["msg"] == "Field required"
        assert error["type"] == "missing"


def test_Test_child_items():
    test = Test(
        **{"if": ">{ ${project.name } }", "assertions": [">{ ${ project.name } }"]}
    )
    assert len(test.child_items()) == 1
    assert test.child_items()[0].value == "${ project.name }"
