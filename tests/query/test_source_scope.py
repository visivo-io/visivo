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
from functools import lru_cache

import pytest

from tests.factories.model_factories import (
    DuckdbSourceFactory,
    InsightFactory,
    ProjectFactory,
    RelationFactory,
    SqlModelFactory,
)
from visivo.jobs.utils import get_source_for_model
from visivo.models.models.sql_model import SqlModel
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
        a missing source into a bogus cross-source complaint.

        A REAL model whose source does not resolve — ``source`` unset and
        nothing tying it to a Source in the dag, the shape a draft-overlay model
        arrives in — not a ``None`` placeholder, which would only exercise the
        loop's other guard."""
        project = one_source_project()
        dag = project.dag()
        orders = dag.get_descendant_by_name("orders")
        unattached = SqlModel(name="unattached", sql="SELECT 1")
        assert get_source_for_model(unattached, dag, "") is None

        resolved = source_names_by_model([orders, unattached], dag)

        # Omitted entirely: not a placeholder name, not the only other source in
        # the project. One model left means len(resolved) < 2, so no rule fires.
        assert resolved == {"orders": "source_a"}

    def test_a_none_placeholder_is_skipped_before_it_is_dereferenced(self):
        """The other guard in the same loop: ``None`` never reaches
        ``model.name``."""
        project = one_source_project()
        dag = project.dag()
        orders = dag.get_descendant_by_name("orders")
        assert source_names_by_model([orders, None], dag) == {"orders": "source_a"}

    def test_an_unresolvable_model_cannot_manufacture_a_cross_source_error(self):
        """The consequence the omission exists for. If the unresolved model were
        given any stand-in name, this single-source project would be refused
        with a message naming a source that does not exist."""
        insight = joining_insight()
        project = one_source_project(insights=[insight])
        dag = project.dag()
        models = list(insight.get_all_dependent_models(dag)) + [
            SqlModel(name="unattached", sql="SELECT 1")
        ]
        assert cross_source_insight_error(insight.name, models, dag) is None


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

    def test_the_dynamic_lane_is_not_an_error(self):
        """``is_dynamic`` means there is no ``pre_query`` to be wrong: each model
        was materialised against its own source and the DuckDB ``post_query``
        joins the parquet files. Same models, same two sources, no failure."""
        insight = joining_insight()
        project = two_source_project(insights=[insight])
        dag = project.dag()
        models = insight.get_all_dependent_models(dag)

        # Falsifiable against itself: strict is the default, so the ONLY
        # difference between these two lines is the lane.
        assert cross_source_insight_error(insight.name, models, dag) is not None
        assert cross_source_insight_error(insight.name, models, dag, is_dynamic=True) is None

    def test_the_flag_is_keyword_only_so_it_cannot_be_passed_by_accident(self):
        """A positional fourth argument is ``output_dir``. If ``is_dynamic``
        could be passed positionally, every caller that threads an output_dir
        would silently disable the rule."""
        insight = joining_insight()
        project = two_source_project(insights=[insight])
        dag = project.dag()
        models = insight.get_all_dependent_models(dag)
        assert cross_source_insight_error(insight.name, models, dag, "/tmp/anything") is not None


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

    def test_the_dynamic_lane_gets_a_deterministic_source_instead_of_a_refusal(self):
        """The dynamic builder still reads a dialect off A source, it just never
        executes against it. The pick must not be the old ``list(a_set)[0]``:
        models are walked in NAME order, so 'orders' (source_a) wins every run
        regardless of how the set was iterated."""
        insight = joining_insight()
        project = two_source_project(insights=[insight])
        dag = project.dag()
        models = insight.get_all_dependent_models(dag)

        source = resolve_insight_source(insight.name, models, dag, is_dynamic=True)
        assert source.name == "source_a"
        # In-process this only proves the name-order rule; the seeded subprocess
        # run below proves it does not move between processes either.

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


# Both messages are built from *sets* — the models come out of
# `get_all_dependent_models`, and the insight headline comma-joins a set of
# SOURCE names on top of that. Python randomises str hashes per process, so
# before the sorts the same broken project blamed either half of the join
# depending on the run, which is exactly what makes a cross-source failure feel
# like a flake rather than a fact. Running the build under several
# PYTHONHASHSEEDs is the only honest way to prove the sorts hold.
#
# Every set-derived string the module emits has to be in here. The relation
# message alone is not enough: `sorted(set(resolved.values()))` in
# `cross_source_insight_error` is the ONLY place a set of source names is
# joined into a headline, and it appears in no relation message — so with only
# the relation covered, dropping that sort still passes roughly one run in six.
# The dynamic lane's source pick is here for the same reason: nothing raises on
# that path, so a `list(a_set)[0]` regression would be invisible otherwise.
#
# THREE models on THREE sources, not two, and deliberately so: with two names a
# random order is right half the time, so an unsorted build can still come out
# identical across a handful of seeds by luck. With three there are six
# permutations, and "every seed agrees AND agrees on the alphabetical one" stops
# being something chance produces.
_DETERMINISM_SCRIPT = textwrap.dedent("""
    from visivo.models.project import Project
    from visivo.models.relation import Relation
    from visivo.models.insight import Insight
    from visivo.models.models.sql_model import SqlModel
    from visivo.models.props.insight_props import InsightProps
    from visivo.models.sources.duckdb_source import DuckdbSource
    from visivo.query.source_scope import (
        cross_source_insight_error,
        cross_source_relation_error,
        resolve_insight_source,
    )

    relation = Relation(
        name="orders_to_users",
        condition="${ref(zebra).user_id} = ${ref(apple).id}",
    )
    insight = Insight(
        name="cross",
        props=InsightProps(
            type="scatter",
            x="?{ ${ ref(zebra).amount } }",
            y="?{ ${ ref(apple).age } }",
        ),
        interactions=[{"filter": "?{ ${ref(cherry).flag} = 1 }"}],
    )
    project = Project(
        name="p",
        sources=[
            DuckdbSource(name="s_zebra", database="z.duckdb", type="duckdb"),
            DuckdbSource(name="s_apple", database="a.duckdb", type="duckdb"),
            DuckdbSource(name="s_cherry", database="c.duckdb", type="duckdb"),
        ],
        models=[
            SqlModel(name="zebra", sql="SELECT 1", source="ref(s_zebra)"),
            SqlModel(name="apple", sql="SELECT 1", source="ref(s_zebra)"),
            SqlModel(name="cherry", sql="SELECT 1", source="ref(s_zebra)"),
        ],
        relations=[relation],
        insights=[insight],
        dashboards=[],
    )
    # Spread them AFTER construction — CrossSourceValidator would (correctly)
    # refuse this static insight otherwise.
    for model in project.models:
        if model.name == "apple":
            model.source = "ref(s_apple)"
        if model.name == "cherry":
            model.source = "ref(s_cherry)"
    project.invalidate_dag_cache()
    dag = project.dag()
    models = insight.get_all_dependent_models(dag)
    print(repr(str(cross_source_relation_error(relation, dag))))
    print(repr(str(cross_source_insight_error(insight.name, models, dag))))
    print(repr(resolve_insight_source(insight.name, models, dag, is_dynamic=True).name))
    """)

_SEEDS = ("0", "1", "42", "12345", "31337", "808")


@lru_cache(maxsize=1)
def _under_every_hash_seed():
    """stdout of the script, once per seed, asserted identical.

    Cached: six interpreter starts is the price of the proof, and the three
    assertions below are three different reads of the SAME six runs."""
    outputs = set()
    for seed in _SEEDS:
        completed = subprocess.run(
            [sys.executable, "-c", _DETERMINISM_SCRIPT],
            capture_output=True,
            text=True,
            env={"PYTHONHASHSEED": seed, "PATH": "/usr/bin:/bin"},
        )
        assert completed.returncode == 0, completed.stderr
        outputs.add(completed.stdout)

    assert len(outputs) == 1, f"output varies with hash seed: {outputs}"
    return outputs.pop().strip().splitlines()


def test_the_relation_message_is_identical_under_every_hash_seed():
    relation_message, _, _ = _under_every_hash_seed()
    # Sorted by model name, not by whatever the set handed back.
    assert relation_message.index("Model 'apple'") < relation_message.index("Model 'zebra'")


def test_the_insight_message_is_identical_under_every_hash_seed():
    _, insight_message, _ = _under_every_hash_seed()
    # The headline joins a set of SOURCE names — the one string in the module
    # whose order no relation message can vouch for.
    assert "more than one source: s_apple, s_cherry, s_zebra." in insight_message
    assert (
        insight_message.index("Model 'apple'")
        < insight_message.index("Model 'cherry'")
        < insight_message.index("Model 'zebra'")
    )


def test_the_dynamic_lane_source_pick_is_identical_under_every_hash_seed():
    _, _, picked_source = _under_every_hash_seed()
    # 'apple' sorts before 'zebra', so its source answers — every process.
    assert picked_source == "'s_apple'"
