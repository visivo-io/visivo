import os

import numpy
import pytest

from tests.factories.model_factories import InsightFactory, ProjectFactory
from tests.support.insight_output import write_insight_output
from tests.support.utils import temp_folder
from visivo.models.base.eval_string import EvalString
from visivo.models.insight import Insight
from visivo.models.project import Project
from visivo.models.test import Test
from visivo.parsers.evaluator import _format_value, evaluate_expression, load_insight_data


@pytest.fixture
def run_output():
    output_dir = temp_folder()
    insight = Insight(name="week", props={"type": "scatter", "x": "?{x}", "y": "?{y}"})
    month = Insight(name="month", props={"type": "scatter", "x": "?{x}", "y": "?{y}"})
    write_insight_output(
        output_dir, "week", {"props.x": [1, 2, 3, 4], "props.y": [10.4, 20.2, 30.0, 40.0]}
    )
    write_insight_output(output_dir, "month", {"props.x": [1, 2], "props.y": [50.6, 50.0]})
    project = Project(**ProjectFactory(insights=[insight, month], dashboards=[]).model_dump())
    return project, output_dir


def check(project, output_dir, assertion):
    dag = project.dag()
    return EvalString(assertion).evaluate(dag=dag, project=project, output_dir=output_dir)


@pytest.mark.parametrize(
    "assertion",
    [
        ">{ numpy.sum( ${ref(week).props.y} ) == numpy.sum( ${ref(month).props.y} ) }",
        ">{ sum( ${ref(week).props.x} ) == 10 }",
        ">{ numpy.std( ${ref(week).props.y} ) * 2 > numpy.std( ${ref(month).props.y[:-1]} ) }",
        ">{ round( ${ref(week).props.y[1]} ) == 20 }",
        ">{ ${ref(week).props.y[-1]} == 40.0 }",
        ">{ len( ${ref(week).props.x} ) == 4 }",
        ">{ numpy.mean( ${ref(week).props.x[1:3]} ) == 2.5 }",
        ">{ ${ref(week).props.type} == 'scatter' }",
        ">{ numpy.all( ${ref(week).props.x} ) == True and 1 < 2 < 3 }",
    ],
)
def test_documented_assertions_pass(run_output, assertion):
    project, output_dir = run_output
    assert check(project, output_dir, assertion)


def test_failed_assertion_explains_values(run_output):
    project, output_dir = run_output
    dag = project.dag()
    explanation = EvalString(">{ sum( ${ref(week).props.x} ) == 11 }").explain(
        dag=dag, project=project, output_dir=output_dir
    )
    assert explanation == "10 == 11"


def test_explain_shows_only_failing_and_operands(run_output):
    project, output_dir = run_output
    dag = project.dag()
    explain = lambda text: EvalString(text).explain(dag=dag, project=project, output_dir=output_dir)
    assert explain(">{ 1 == 1 and sum( ${ref(week).props.x} ) == 1 }") == "10 == 1"
    assert explain(">{ 2 < 1 and 3 < 1 }") == "2 < 1; 3 < 1"
    assert explain(">{ 1 + 1 }") == "2"
    assert explain(">{ ${ref(week).props.x}[0] < 0 }") == "1 < 0"
    assert explain(">{ ${ref(week).props.y[:2]} }") == "[10.4 20.2]"


def test_long_arrays_are_truncated_in_explanations():
    assert "..." in _format_value(numpy.arange(100))


def test_missing_run_output_says_to_run(run_output):
    project, _ = run_output
    with pytest.raises(FileNotFoundError, match="visivo run"):
        check(project, temp_folder(), ">{ sum( ${ref(week).props.x} ) == 10 }")


def test_missing_data_file_says_to_run(run_output):
    project, output_dir = run_output
    os.remove(os.path.join(output_dir, "main", "insights", "week.parquet"))
    with pytest.raises(FileNotFoundError, match="Data file not found"):
        check(project, output_dir, ">{ sum( ${ref(week).props.x} ) == 10 }")


def test_data_file_relocated_with_output_dir(run_output):
    project, output_dir = run_output
    import json

    info_path = os.path.join(output_dir, "main", "insights", "week.json")
    info = json.load(open(info_path))
    absolute = info["files"][0]["signed_data_file_url"]
    info["files"][0]["signed_data_file_url"] = "/elsewhere/" + os.path.relpath(absolute, output_dir)
    json.dump(info, open(info_path, "w"))
    assert check(project, output_dir, ">{ sum( ${ref(week).props.x} ) == 10 }")


def test_static_insight_has_only_static_props():
    output_dir = temp_folder()
    insights_dir = os.path.join(output_dir, "main", "insights")
    os.makedirs(insights_dir)
    import json

    json.dump(
        {
            "name": "s",
            "files": [],
            "query": None,
            "props_mapping": {},
            "static_props": {"props.z": 3},
        },
        open(os.path.join(insights_dir, "s.json"), "w"),
    )
    assert load_insight_data(output_dir, "s") == {"props": {"z": 3}}


@pytest.mark.parametrize(
    "expression, message",
    [
        ("os.getcwd() == 1", "Unsupported function"),
        ("foo(1) == 1", "Unsupported function: foo"),
        ("numpy.linalg(1) == 1", "Unsupported numpy function: linalg"),
        ("numpy.sum.x(1)", "Unsupported function call"),
        ("unknown == 1", "Unsupported name: unknown"),
        ("1 in [1]", "Unsupported comparison operator"),
        ("1 or 2", "Unsupported boolean operator"),
        ("{1: 2}", "Unsupported type"),
        ("1 +", "Invalid expression"),
    ],
)
def test_unsupported_expressions_raise(expression, message):
    with pytest.raises(ValueError, match=message):
        evaluate_expression(expression)


def test_env_and_project_attributes(monkeypatch):
    monkeypatch.setenv("VIS_EVAL_VALUE", "7")
    assert evaluate_expression("env.VIS_EVAL_VALUE == '7'")

    class FakeProject:
        name = "demo"

    assert evaluate_expression("project.name == 'demo'", project=FakeProject())


def test_arithmetic_and_lists():
    assert evaluate_expression("-(2 ** 3) + 10 / 5 * 2 - 1 == -5.0")
    assert evaluate_expression("[1, 2] == [1, 2]")
    assert evaluate_expression("round(2.6) == 3")


def test_any_test_failed_uses_test_run():
    from visivo.models.test_run import TestRun

    assert evaluate_expression("any_test_failed()") is False
    assert evaluate_expression("any_test_failed()", test_run=TestRun()) is True


def test_assertion_without_wrapper_names_test():
    with pytest.raises(ValueError, match="Test 'my-test'.*assertion 2.*wrapped as"):
        Test(name="my-test", assertions=[">{ 1 == 1 }", "1 == 1"])


def test_assertion_wrapper_error_names_file():
    with pytest.raises(ValueError, match="in /tmp/project.visivo.yml"):
        Test(name="t", assertions=["1 == 1"], file_path="/tmp/project.visivo.yml")


def test_if_condition_contributes_references():
    test = Test(
        name="t",
        **{"if": ">{ ${ref(week).props.type} == 'scatter' }"},
        assertions=[">{ 1 == 1 }"],
    )
    assert [c.get_reference() for c in test.child_items()] == ["week"]
