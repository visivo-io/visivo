"""Insight-to-insight references in trace-id props (VIS-1464 P1).

Plotly binds a contourcarpet / scattercarpet to a carpet through a string id
(``carpet`` on both). Authors write ``carpet: ${ref(carpet-plot)}``; compile
must resolve that to the carpet insight's trace id, default the carpet's own
id to its name, and keep the carpet ahead of the contour in the DAG.
"""

import json

import networkx as nx
import pytest
from pydantic import ValidationError

from tests.factories.model_factories import SourceFactory
from visivo.models.insight import Insight, _insight_ref_name
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.models.props.insight_props import InsightProps
from visivo.query.insight.insight_query_builder import InsightQueryBuilder


def _carpet_project(contour_carpet="${ref(carpet-plot)}", carpet_id=None, extra=None):
    source = SourceFactory()
    model = SqlModel(name="grid", sql="SELECT 1 as a", source=f"ref({source.name})")
    carpet_props = dict(
        type="carpet",
        a="?{${ref(grid).a}}",
        b="?{${ref(grid).b}}",
        y="?{${ref(grid).y}}",
    )
    if carpet_id is not None:
        carpet_props["carpet"] = carpet_id
    carpet = Insight(name="carpet-plot", props=InsightProps(**carpet_props))
    contour = Insight(
        name="contour",
        props=InsightProps(type="contourcarpet", carpet=contour_carpet, z="?{${ref(grid).z}}"),
    )
    insights = [carpet, contour] + (extra or [])
    project = Project(name="p", sources=[source], models=[model], insights=insights, dashboards=[])
    return project, carpet, contour, model


def _write_schema(tmpdir, model, columns):
    schema_dir = tmpdir.mkdir("schemas")
    schema_dir.join(f"{model.name}.json").write(json.dumps({model.name_hash(): columns}))


# ---------------------------------------------------------------------------
# Schema-driven prop discovery
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("trace_type", ["contourcarpet", "scattercarpet"])
def test_carpet_is_an_insight_ref_prop_on_the_traces_that_lie_on_one(trace_type):
    assert InsightProps.insight_ref_props(trace_type) == {"carpet"}
    assert InsightProps.trace_id_props(trace_type) == set()


def test_carpet_is_the_identifier_on_the_carpet_trace_itself():
    assert InsightProps.trace_id_props("carpet") == {"carpet"}
    assert InsightProps.insight_ref_props("carpet") == set()


def test_ordinary_traces_have_no_trace_id_props():
    assert InsightProps.insight_ref_props("scatter") == set()
    assert InsightProps.trace_id_props("scatter") == set()


def test_generated_schema_accepts_a_ref_in_a_link_prop():
    InsightProps(type="contourcarpet", carpet="${ref(carpet-plot)}")
    InsightProps(type="scattercarpet", carpet="${ ref('carpet plot') }")
    InsightProps(type="contourcarpet", carpet="c1")


# ---------------------------------------------------------------------------
# _insight_ref_name
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "value, expected",
    [
        ("${ref(carpet-plot)}", "carpet-plot"),
        ("${ ref( carpet-plot ) }", "carpet-plot"),
        ("${ref('carpet plot')}", "carpet plot"),
        ("${ref(carpet-plot).carpet}", None),  # accessor form: an input/model ref
        ("${ref(carpet-plot)[0]}", None),
        ("carpet-plot", None),
        ("?{ ${ref(grid).a} }", None),
        (None, None),
        (3, None),
    ],
)
def test_insight_ref_name(value, expected):
    assert _insight_ref_name(value) == expected


# ---------------------------------------------------------------------------
# Resolution
# ---------------------------------------------------------------------------
def test_contour_ref_resolves_to_the_carpet_insight_name():
    project, carpet, contour, _ = _carpet_project()
    dag = project.dag()
    assert contour.resolved_static_props(dag) == {"carpet": "carpet-plot"}
    # The carpet's own id defaults to its name so the binding actually lands.
    assert carpet.resolved_static_props(dag) == {"carpet": "carpet-plot"}


def test_contour_ref_resolves_to_an_explicit_carpet_id():
    project, carpet, contour, _ = _carpet_project(carpet_id="c1")
    dag = project.dag()
    assert carpet.resolved_static_props(dag)["carpet"] == "c1"
    assert contour.resolved_static_props(dag)["carpet"] == "c1"


def test_a_literal_carpet_id_on_the_contour_is_left_alone():
    project, _, contour, _ = _carpet_project(contour_carpet="c1")
    assert contour.resolved_static_props(project.dag())["carpet"] == "c1"


def test_trace_id_falls_back_to_name():
    _, carpet, contour, _ = _carpet_project()
    assert carpet.trace_id("carpet") == "carpet-plot"
    # A link value is never an id of its own.
    assert contour.trace_id("carpet") == "contour"


def test_resolution_goes_through_the_query_builder_static_props(tmpdir):
    project, carpet, contour, model = _carpet_project()
    dag = project.dag()
    _write_schema(tmpdir, model, {"a": "INTEGER", "b": "INTEGER", "y": "INTEGER", "z": "INTEGER"})
    assert InsightQueryBuilder(contour, dag, str(tmpdir)).static_props == {"carpet": "carpet-plot"}
    assert InsightQueryBuilder(carpet, dag, str(tmpdir)).static_props == {"carpet": "carpet-plot"}


def test_unknown_insight_is_rejected_by_project_validation():
    with pytest.raises(ValidationError, match="ref\\(nope\\)"):
        _carpet_project(contour_carpet="${ref(nope)}")


def test_unknown_insight_at_resolve_time_is_a_clear_error():
    project, _, contour, _ = _carpet_project()
    dag = project.dag()
    with pytest.raises(ValueError, match="no insight named 'nope' could be resolved"):
        contour.resolve_insight_refs({"carpet": "${ref(nope)}"}, dag)


def test_ref_to_a_non_insight_is_rejected():
    project, _, contour, _ = _carpet_project()
    dag = project.dag()
    with pytest.raises(ValueError, match="'grid' is a SqlModel"):
        contour.resolve_insight_refs({"carpet": "${ref(grid)}"}, dag)


def test_resolution_is_a_no_op_for_an_insight_without_props():
    insight = Insight(name="bare")
    assert insight.resolve_insight_refs({"x": 1}, None) == {"x": 1}
    assert insight.resolved_static_props(None) == {}
    assert insight.trace_id("carpet") == "bare"


# ---------------------------------------------------------------------------
# DAG
# ---------------------------------------------------------------------------
def test_contour_depends_on_its_carpet_in_the_dag():
    project, carpet, contour, _ = _carpet_project()
    dag = project.dag()
    assert "ref(carpet-plot)" in contour.child_items()
    assert carpet in list(dag.successors(contour))
    # Dependencies run before dependents: the carpet precedes the contour in
    # the reverse-topological order the runner follows.
    order = list(reversed(list(nx.topological_sort(dag))))
    assert order.index(carpet) < order.index(contour)


def test_two_carpets_bind_independently():
    project, carpet, contour, model = _carpet_project()
    second_carpet = Insight(
        name="carpet-two",
        props=InsightProps(type="carpet", a="?{${ref(grid).a}}", b="?{${ref(grid).b}}"),
    )
    second_contour = Insight(
        name="contour-two",
        props=InsightProps(
            type="contourcarpet", carpet="${ref(carpet-two)}", z="?{${ref(grid).z}}"
        ),
    )
    project = Project(
        name="p",
        sources=project.sources,
        models=project.models,
        insights=[carpet, contour, second_carpet, second_contour],
        dashboards=[],
    )
    dag = project.dag()
    assert contour.resolved_static_props(dag)["carpet"] == "carpet-plot"
    assert second_contour.resolved_static_props(dag)["carpet"] == "carpet-two"


# ---------------------------------------------------------------------------
# Review findings (two-model fixtures, target typing, query-bound ids)
# ---------------------------------------------------------------------------
def _two_model_project():
    source = SourceFactory()
    model_a = SqlModel(name="ma", sql="SELECT 1 as z", source=f"ref({source.name})")
    model_b = SqlModel(name="mb", sql="SELECT 1 as a, 2 as b", source=f"ref({source.name})")
    carpet = Insight(
        name="carpet-b",
        props=InsightProps(type="carpet", a="?{${ref(mb).a}}", b="?{${ref(mb).b}}"),
    )
    contour = Insight(
        name="contour-a",
        props=InsightProps(type="contourcarpet", carpet="${ref(carpet-b)}", z="?{${ref(ma).z}}"),
    )
    project = Project(
        name="p",
        sources=[source],
        models=[model_a, model_b],
        insights=[carpet, contour],
        dashboards=[],
    )
    return project, carpet, contour, model_a, model_b


def test_a_ref_edge_does_not_pull_in_the_siblings_models():
    project, carpet, contour, model_a, model_b = _two_model_project()
    dag = project.dag()
    assert contour.get_all_dependent_models(dag) == {model_a}
    assert carpet.get_all_dependent_models(dag) == {model_b}
    # The ordering edge itself is kept.
    assert carpet in list(dag.successors(contour))


def test_contour_on_model_a_runs_against_model_a_only(tmpdir):
    from visivo.jobs.run_insight_job import action

    project, carpet, contour, model_a, model_b = _two_model_project()
    dag = project.dag()
    schema_dir = tmpdir.mkdir("main").mkdir("schemas")
    schema_dir.join("ma.json").write(json.dumps({model_a.name_hash(): {"z": "INTEGER"}}))
    schema_dir.join("mb.json").write(
        json.dumps({model_b.name_hash(): {"a": "INTEGER", "b": "INTEGER"}})
    )

    result = action(contour, dag, str(tmpdir))

    assert result.success is True, result.message
    with open(tmpdir.join("main", "insights", "contour-a.json")) as f:
        artifact = json.load(f)
    assert artifact["static_props"] == {"carpet": "carpet-b"}
    assert [file["name_hash"] for file in artifact["files"]] == [contour.name_hash()]


def test_ref_to_an_insight_that_does_not_own_the_id_is_rejected():
    project, carpet, contour, _ = _carpet_project()
    dag = project.dag()
    # A contourcarpet does not own a `carpet` id; only a carpet trace does.
    with pytest.raises(ValueError, match="must reference a 'carpet' insight.*is a contourcarpet"):
        contour.resolve_insight_refs({"carpet": "${ref(contour)}"}, dag)


def test_ref_to_a_props_less_insight_is_rejected():
    project, carpet, contour, _ = _carpet_project(extra=[Insight(name="bare")])
    dag = project.dag()
    with pytest.raises(ValueError, match="'bare' is a props-less insight"):
        contour.resolve_insight_refs({"carpet": "${ref(bare)}"}, dag)


def test_query_bound_carpet_id_gets_no_static_default_and_cannot_be_referenced():
    project, carpet, contour, _ = _carpet_project(carpet_id="?{${ref(grid).a}}")
    dag = project.dag()
    # The id comes from the query: nothing is injected into static props...
    assert "carpet" not in carpet.resolved_static_props(dag)
    # ...and a sibling cannot bind to a data-driven id by name.
    with pytest.raises(ValueError, match="binds 'carpet' to a query"):
        contour.resolved_static_props(dag)


def test_resolution_error_keeps_the_dag_lookup_detail():
    project, _, contour, _ = _carpet_project()
    dag = project.dag()
    with pytest.raises(ValueError) as excinfo:
        contour.resolve_insight_refs({"carpet": "${ref(nope)}"}, dag)
    assert "no insight named 'nope' could be resolved: No node found with name 'nope'" in str(excinfo.value)
    assert isinstance(excinfo.value.__cause__, ValueError)
