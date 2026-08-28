"""The single-source rule, and the fact that its message never moves.

``Relation.validate_same_source`` was written, worded well, fully tested — and
called by nothing but its own tests. These tests cover the pure rule now that it
lives in one place; ``tests/models/validators/test_cross_source_validator.py``
covers it actually being asked at compile, and
``tests/jobs/test_run_insight_job_cross_source.py`` covers the runtime guard.
"""

import subprocess
import sys
import textwrap

import pytest

from tests.factories.model_factories import (
    DuckdbSourceFactory,
    InsightFactory,
    ProjectFactory,
    RelationFactory,
    SqlModelFactory,
)
from visivo.models.props.insight_props import InsightProps
from visivo.models.diagnostic import DIAGNOSTIC_CODES, DiagnosticPhase
from visivo.query.source_scope import (
    CrossSourceError,
    cross_source_insight_error,
    cross_source_relation_error,
    resolve_insight_source,
    source_names_by_model,
)


def two_source_project(**kwargs):
    """orders on source_a, users on source_b — built by going AROUND the gate.

    Now that ``CrossSourceValidator`` is wired, a cross-source project cannot be
    constructed: ``Project``'s ``mode="after"`` validator rejects it outright.
    That is the whole point of T1, and it means every test of the downstream
    guards has to reach the invalid state the way real code paths do — by
    mutating a valid project after construction (nothing re-validates on
    assignment) and dropping the cached DAG.
    """
    project = ProjectFactory(
        sources=[
            DuckdbSourceFactory(name="source_a", database="a.duckdb"),
            DuckdbSourceFactory(name="source_b", database="b.duckdb"),
        ],
        models=[
            SqlModelFactory(name="orders", sql="SELECT * FROM orders", source="ref(source_a)"),
            SqlModelFactory(name="users", sql="SELECT * FROM users", source="ref(source_a)"),
        ],
        dashboards=[],
        **kwargs,
    )
    for model in project.models:
        if model.name == "users":
            model.source = "ref(source_b)"
    project.invalidate_dag_cache()
    return project


def one_source_project(**kwargs):
    return ProjectFactory(
        sources=[DuckdbSourceFactory(name="source_a", database="a.duckdb")],
        models=[
            SqlModelFactory(name="orders", sql="SELECT * FROM orders", source="ref(source_a)"),
            SqlModelFactory(name="users", sql="SELECT * FROM users", source="ref(source_a)"),
        ],
        dashboards=[],
        **kwargs,
    )


def joining_insight(name="cross"):
    return InsightFactory(
        name=name,
        props=InsightProps(
            type="scatter",
            x="?{ ${ ref(orders).amount } }",
            y="?{ ${ ref(users).age } }",
        ),
    )


class TestSourceNamesByModel:
    def test_resolves_every_model_to_its_source_name(self):
        project = two_source_project()
        dag = project.dag()
        models = [dag.get_descendant_by_name(n) for n in ("orders", "users")]
        assert source_names_by_model(models, dag) == {"orders": "source_a", "users": "source_b"}

    def test_a_model_with_no_resolvable_source_is_omitted_not_guessed(self):
        """ModelsHaveSourcesValidator owns "no source"; guessing here would turn
        a missing source into a bogus cross-source complaint."""
        project = one_source_project()
        dag = project.dag()
        orders = dag.get_descendant_by_name("orders")
        assert source_names_by_model([orders, None], dag) == {"orders": "source_a"}


class TestRelationRule:
    def test_a_relation_across_two_sources_names_both_models_and_both_sources(self):
        relation = RelationFactory(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
        )
        project = two_source_project(relations=[relation])
        error = cross_source_relation_error(relation, project.dag())

        assert isinstance(error, CrossSourceError)
        assert str(error) == (
            "Relation 'orders_to_users' connects models from different sources.\n"
            "\n"
            "  Model 'orders' uses source: source_a\n"
            "  Model 'users' uses source: source_b\n"
            "\n"
            "Cross-source relations are not currently supported. "
            "Both models must use the same source."
        )

    def test_a_relation_inside_one_source_is_not_an_error(self):
        relation = RelationFactory(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
        )
        project = one_source_project(relations=[relation])
        assert cross_source_relation_error(relation, project.dag()) is None

    def test_a_relation_naming_a_model_that_does_not_exist_defers(self):
        """RelationReferencesValidator reports the broken ref; this rule must
        not crash trying to resolve it first."""
        relation = RelationFactory(name="ghost", condition="${ref(orders).id} = ${ref(nope).id}")
        project = one_source_project()
        assert cross_source_relation_error(relation, project.dag()) is None

    def test_the_model_shim_still_raises_and_still_takes_an_output_dir(self, tmpdir):
        relation = RelationFactory(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
        )
        project = two_source_project(relations=[relation])
        with pytest.raises(ValueError, match="different sources"):
            relation.validate_same_source(project.dag(), str(tmpdir))


class TestInsightRule:
    def test_an_insight_across_two_sources_names_both_models_and_both_sources(self):
        insight = joining_insight()
        project = two_source_project(insights=[insight])
        dag = project.dag()
        error = cross_source_insight_error(insight.name, insight.get_all_dependent_models(dag), dag)

        assert str(error) == (
            "Insight 'cross' references models from more than one source: "
            "source_a, source_b.\n"
            "\n"
            "  Model 'orders' uses source: source_a\n"
            "  Model 'users' uses source: source_b\n"
            "\n"
            "Cross-source insights are not currently supported. "
            "Every model an insight references must use the same source."
        )

    def test_an_insight_inside_one_source_is_not_an_error(self):
        insight = joining_insight()
        project = one_source_project(insights=[insight])
        dag = project.dag()
        assert (
            cross_source_insight_error(insight.name, insight.get_all_dependent_models(dag), dag)
            is None
        )


class TestResolveInsightSource:
    def test_returns_the_one_shared_source(self):
        insight = joining_insight()
        project = one_source_project(insights=[insight])
        dag = project.dag()
        source = resolve_insight_source(insight.name, insight.get_all_dependent_models(dag), dag)
        assert source.name == "source_a"

    def test_raises_rather_than_picking_a_winner(self):
        insight = joining_insight()
        project = two_source_project(insights=[insight])
        dag = project.dag()
        with pytest.raises(CrossSourceError) as excinfo:
            resolve_insight_source(insight.name, insight.get_all_dependent_models(dag), dag)
        assert excinfo.value.source_names == ["source_a", "source_b"]

    def test_no_models_is_a_sentence_not_an_index_error(self):
        project = one_source_project()
        with pytest.raises(ValueError, match="has no dependent models"):
            resolve_insight_source("empty", set(), project.dag())


class TestDiagnostic:
    def test_the_code_is_registered(self):
        assert "cross_source" in DIAGNOSTIC_CODES

    def test_it_carries_the_object_the_sources_and_a_stable_id(self):
        insight = joining_insight()
        project = two_source_project(insights=[insight])
        dag = project.dag()
        error = cross_source_insight_error(insight.name, insight.get_all_dependent_models(dag), dag)

        diagnostic = error.diagnostic(DiagnosticPhase.RUN)
        assert diagnostic.code == "cross_source"
        assert diagnostic.phase == DiagnosticPhase.RUN
        assert diagnostic.object.type == "insight"
        assert diagnostic.object.name == "cross"
        assert diagnostic.id == "run:cross_source:insight:cross"
        # One headline sentence, never the multi-line body.
        assert "\n" not in diagnostic.message
        assert diagnostic.detail == error.message
        assert [related.object.name for related in diagnostic.related] == ["orders", "users"]
        assert error.error_details() == {
            "error_type": "multi_source",
            "error_models": ["orders", "users"],
            "error_sources": ["source_a", "source_b"],
        }

    def test_the_same_error_at_a_different_phase_gets_a_different_id(self):
        insight = joining_insight()
        project = two_source_project(insights=[insight])
        dag = project.dag()
        error = cross_source_insight_error(insight.name, insight.get_all_dependent_models(dag), dag)
        assert error.diagnostic(DiagnosticPhase.SERVE).id == "serve:cross_source:insight:cross"


# The message is built from a *set* of model names, and Python randomises str
# hashes per process — so before this the same broken project blamed either half
# of the join depending on the run, which is exactly what makes a cross-source
# failure feel like a flake rather than a fact. Running the build under several
# PYTHONHASHSEEDs is the only honest way to prove the sort holds.
_DETERMINISM_SCRIPT = textwrap.dedent("""
    from visivo.models.project import Project
    from visivo.models.relation import Relation
    from visivo.models.models.sql_model import SqlModel
    from visivo.models.sources.duckdb_source import DuckdbSource
    from visivo.query.source_scope import cross_source_relation_error

    relation = Relation(
        name="orders_to_users",
        condition="${ref(zebra).user_id} = ${ref(apple).id}",
    )
    project = Project(
        name="p",
        sources=[
            DuckdbSource(name="s_zebra", database="z.duckdb", type="duckdb"),
            DuckdbSource(name="s_apple", database="a.duckdb", type="duckdb"),
        ],
        models=[
            SqlModel(name="zebra", sql="SELECT 1", source="ref(s_zebra)"),
            SqlModel(name="apple", sql="SELECT 1", source="ref(s_zebra)"),
        ],
        relations=[relation],
        dashboards=[],
    )
    for model in project.models:
        if model.name == "apple":
            model.source = "ref(s_apple)"
    project.invalidate_dag_cache()
    print(repr(str(cross_source_relation_error(relation, project.dag()))))
    """)


def test_the_message_is_identical_under_every_hash_seed():
    messages = set()
    for seed in ("0", "1", "42", "12345"):
        completed = subprocess.run(
            [sys.executable, "-c", _DETERMINISM_SCRIPT],
            capture_output=True,
            text=True,
            env={"PYTHONHASHSEED": seed, "PATH": "/usr/bin:/bin"},
        )
        assert completed.returncode == 0, completed.stderr
        messages.add(completed.stdout.strip())

    assert len(messages) == 1, f"message varies with hash seed: {messages}"
    # And it is sorted by model name, not by whatever the set handed back.
    only = messages.pop()
    assert only.index("Model 'apple'") < only.index("Model 'zebra'")
