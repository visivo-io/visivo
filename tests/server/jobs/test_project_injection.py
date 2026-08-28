"""The cached-object overlay has to reproduce the project's SHAPE, not just its
contents.

A model-scoped metric/dimension is scoped by being nested inside its model —
that nesting is the only record of the scope, because ``_parent_name`` is a
PrivateAttr and neither ``Metric`` nor ``Dimension`` has a ``model`` field to
carry one (both are ``extra="forbid"``). VIS-1259 reached that conclusion for
the deploy wire; these tests hold the same line for the local editor's overlay,
which every ``visivo serve`` run, draft preview and commit gate is built on.
"""

import json
import os
from copy import deepcopy
from types import SimpleNamespace

import pytest

from tests.factories.model_factories import (
    DimensionFactory,
    MetricFactory,
    ProjectFactory,
    SqlModelFactory,
)
from visivo.query.resolvers.field_resolver import FieldResolver
from visivo.server.jobs.project_injection import (
    inject_cached_objects,
    renest_model_scoped_fields,
)


def _flask_app(project, **cached):
    """A minimal stand-in: ``inject_cached_objects`` reads ``.cached_objects``
    off each manager and skips any manager that is missing."""
    managers = {
        f"{kind}_manager": SimpleNamespace(cached_objects=objects)
        for kind, objects in cached.items()
    }
    return SimpleNamespace(project=project, **managers)


def _project(**kwargs):
    kwargs.setdefault("models", [SqlModelFactory(name="orders")])
    return ProjectFactory(insights=[], charts=[], dashboards=[], **kwargs)


def _overlay(flask_app):
    project = deepcopy(flask_app.project)
    inject_cached_objects(flask_app, project)
    project.invalidate_dag_cache()
    return project


@pytest.fixture
def schema_dir(tmp_path):
    """A schema file for ``orders``, so the raw-column ("implicit dimension")
    branch of ``FieldResolver`` is reachable — that branch is where a flattened
    field's reference wrongly ends up."""

    def _write(model, columns):
        os.makedirs(tmp_path / "schemas", exist_ok=True)
        with open(tmp_path / "schemas" / f"{model.name}.json", "w") as fp:
            json.dump({model.name_hash(): columns}, fp)
        return str(tmp_path)

    return _write


class TestModelScopedFieldsSurviveTheOverlay:
    def test_a_model_scoped_metric_comes_back_nested_under_its_model(self):
        draft = MetricFactory(name="avg_amount", expression="avg(amount)")
        draft.set_parent_name("orders")

        project = _overlay(_flask_app(_project(), metric={"avg_amount": draft}))

        (model,) = project.models
        assert [m.name for m in model.metrics or []] == ["avg_amount"]
        assert [m.name for m in project.metrics or []] == []

    def test_a_model_scoped_dimension_comes_back_nested_under_its_model(self):
        draft = DimensionFactory(name="loud_region", expression="upper(region)")
        draft.set_parent_name("orders")

        project = _overlay(_flask_app(_project(), dimension={"loud_region": draft}))

        (model,) = project.models
        assert [d.name for d in model.dimensions or []] == ["loud_region"]
        assert [d.name for d in project.dimensions or []] == []

    def test_the_nested_field_keeps_its_parent_and_is_not_addressable_project_level(self):
        """Identity, both halves: it still knows its owner, and it is no longer
        reachable as a project-level field of the same name."""
        draft = MetricFactory(name="avg_amount", expression="avg(amount)")
        draft.set_parent_name("orders")

        project = _overlay(_flask_app(_project(), metric={"avg_amount": draft}))

        (nested,) = project.models[0].metrics
        assert nested._parent_name == "orders"
        assert nested.child_items() == ["ref(orders)"]
        assert "avg_amount" not in {m.name for m in project.metrics or []}

    def test_a_project_level_field_is_left_alone(self):
        """The pass keys off ``_parent_name``, not off the type — a genuinely
        project-level metric is its own object and stays where it is."""
        draft = MetricFactory(name="global_total", expression="sum(${ref(orders).amount})")

        project = _overlay(_flask_app(_project(), metric={"global_total": draft}))

        assert [m.name for m in project.metrics or []] == ["global_total"]
        assert project.models[0].metrics in (None, [])

    def test_a_field_scoped_to_a_missing_model_stays_top_level(self):
        """Dropping it would hide the mistake; leaving it lets the normal
        validators name it."""
        orphan = MetricFactory(name="orphan", expression="count(*)")
        orphan.set_parent_name("deleted_model")

        project = _overlay(_flask_app(_project(), metric={"orphan": orphan}))

        assert [m.name for m in project.metrics or []] == ["orphan"]

    def test_the_cached_field_replaces_the_published_one_of_the_same_name(self):
        """Editing an already-nested field must overwrite it, not double it."""
        published = MetricFactory(name="avg_amount", expression="avg(old)")
        model = SqlModelFactory(name="orders", metrics=[published])
        draft = MetricFactory(name="avg_amount", expression="avg(amount)")
        draft.set_parent_name("orders")

        project = _overlay(_flask_app(_project(models=[model]), metric={"avg_amount": draft}))

        assert [(m.name, m.expression) for m in project.models[0].metrics] == [
            ("avg_amount", "avg(amount)")
        ]

    def test_it_re_nests_onto_the_cached_model_not_the_published_one(self):
        """Models are overlaid before the re-nesting pass runs, so a field lands
        on the model the user is actually editing."""
        model = SqlModelFactory(name="orders", sql="select * from published")
        edited = SqlModelFactory(name="orders", sql="select * from edited")
        draft = MetricFactory(name="avg_amount", expression="avg(amount)")
        draft.set_parent_name("orders")

        project = _overlay(
            _flask_app(
                _project(models=[model]),
                model={"orders": edited},
                metric={"avg_amount": draft},
            )
        )

        (owner,) = project.models
        assert owner.sql == "select * from edited"
        assert [m.name for m in owner.metrics or []] == ["avg_amount"]


class TestTheReferenceTheExplorerActuallyEmits:
    """``${ref(model).field}`` is how a model-scoped field is addressed. Whether
    it resolves is the whole point of keeping the nesting."""

    def test_a_model_scoped_metric_resolves_through_its_qualified_reference(self, schema_dir):
        draft = MetricFactory(name="avg_amount", expression="avg(amount)")
        draft.set_parent_name("orders")
        flask_app = _flask_app(_project(), metric={"avg_amount": draft})
        output_dir = schema_dir(flask_app.project.models[0], {"amount": "DOUBLE"})

        project = _overlay(flask_app)
        resolver = FieldResolver(dag=project.dag(), output_dir=output_dir, native_dialect="duckdb")

        assert "AVG(" in resolver.resolve("${ref(orders).avg_amount}", alias=False).upper()

    def test_a_computed_field_is_not_silently_replaced_by_a_column_it_shadows(self, schema_dir):
        """The quiet half of the bug. When the alias matches a real column, a
        flattened field does not error — the raw column answers instead, so a
        computed field reads as a plain dimension and the numbers are wrong with
        nothing to see."""
        draft = DimensionFactory(name="region", expression="upper(region)")
        draft.set_parent_name("orders")
        flask_app = _flask_app(_project(), dimension={"region": draft})
        output_dir = schema_dir(flask_app.project.models[0], {"region": "VARCHAR"})

        project = _overlay(flask_app)
        resolver = FieldResolver(dag=project.dag(), output_dir=output_dir, native_dialect="duckdb")

        resolved = resolver.resolve("${ref(orders).region}", alias=False)
        assert "UPPER(" in resolved.upper()


class TestTheShapeSurvivesTheRoundTripTheCommitGateMakes:
    def test_nesting_survives_model_dump_where_the_private_attr_does_not(self):
        """Why nesting is the fix and a ``_parent_name`` fallback is not: the
        commit gate re-constructs the project from ``model_dump()``, and a
        PrivateAttr does not survive that. Nested, the scope is in the data."""
        from visivo.models.project import Project

        draft = MetricFactory(name="avg_amount", expression="avg(amount)")
        draft.set_parent_name("orders")

        project = _overlay(_flask_app(_project(), metric={"avg_amount": draft}))
        rebuilt = Project(**project.model_dump(exclude_none=True))

        (nested,) = rebuilt.models[0].metrics
        assert nested.name == "avg_amount"
        assert nested._parent_name == "orders"
        assert rebuilt.metrics in (None, [])

    def test_a_flat_dump_of_the_same_field_carries_no_owner_at_all(self):
        """The counterfactual, stated as data: flattened, the dump is
        ``{name, expression}`` — there is no field on ``Metric`` that could
        record the model, so the scope is simply gone."""
        draft = MetricFactory(name="avg_amount", expression="avg(amount)")
        draft.set_parent_name("orders")
        project = _project()
        project.metrics = [draft]

        dumped = project.model_dump(exclude_none=True)["metrics"][0]

        assert set(dumped) & {"model", "parentModel", "parent_name"} == set()


class TestRenestIsSafeToRunOnItsOwn:
    def test_it_is_idempotent(self):
        draft = MetricFactory(name="avg_amount", expression="avg(amount)")
        draft.set_parent_name("orders")
        project = _overlay(_flask_app(_project(), metric={"avg_amount": draft}))

        renest_model_scoped_fields(project)

        assert [m.name for m in project.models[0].metrics] == ["avg_amount"]
        assert project.metrics == []

    def test_a_project_with_no_models_does_not_blow_up(self):
        orphan = MetricFactory(name="orphan", expression="count(*)")
        orphan.set_parent_name("gone")
        project = _project()
        project.models = []
        project.metrics = [orphan]

        renest_model_scoped_fields(project)

        assert [m.name for m in project.metrics] == ["orphan"]
