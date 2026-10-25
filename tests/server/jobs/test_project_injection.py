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


def _scoped(factory, name, expression, parent="orders"):
    field = factory(name=name, expression=expression)
    field.set_parent_name(parent)
    return field


@pytest.fixture
def schema_dir(tmp_path):
    def _write(model, columns):
        os.makedirs(tmp_path / "schemas", exist_ok=True)
        with open(tmp_path / "schemas" / f"{model.name}.json", "w") as fp:
            json.dump({model.name_hash(): columns}, fp)
        return str(tmp_path)

    return _write


class TestModelScopedFieldsSurviveTheOverlay:
    @pytest.mark.parametrize(
        "kind,factory,attr",
        [("metric", MetricFactory, "metrics"), ("dimension", DimensionFactory, "dimensions")],
    )
    def test_a_new_model_scoped_field_comes_back_nested_under_its_model(self, kind, factory, attr):
        draft = _scoped(factory, "computed", "upper(region)")

        project = _overlay(_flask_app(_project(), **{kind: {"computed": draft}}))

        (model,) = project.models
        (nested,) = getattr(model, attr)
        assert nested.name == "computed"
        assert nested._parent_name == "orders"
        assert getattr(project, attr) in (None, [])

    def test_a_project_level_field_is_left_alone(self):
        draft = MetricFactory(name="global_total", expression="sum(${ref(orders).amount})")

        project = _overlay(_flask_app(_project(), metric={"global_total": draft}))

        assert [m.name for m in project.metrics or []] == ["global_total"]
        assert project.models[0].metrics in (None, [])

    def test_a_field_scoped_to_a_missing_model_stays_top_level(self):
        orphan = _scoped(MetricFactory, "orphan", "count(*)", parent="deleted_model")

        project = _overlay(_flask_app(_project(), metric={"orphan": orphan}))

        assert [m.name for m in project.metrics or []] == ["orphan"]

    def test_the_cached_field_replaces_the_published_one_of_the_same_name(self):
        published = MetricFactory(name="avg_amount", expression="avg(old)")
        model = SqlModelFactory(name="orders", metrics=[published])
        draft = _scoped(MetricFactory, "avg_amount", "avg(amount)")

        project = _overlay(_flask_app(_project(models=[model]), metric={"avg_amount": draft}))

        assert [(m.name, m.expression) for m in project.models[0].metrics] == [
            ("avg_amount", "avg(amount)")
        ]

    def test_it_re_nests_onto_the_cached_model_not_the_published_one(self):
        model = SqlModelFactory(name="orders", sql="select * from published")
        edited = SqlModelFactory(name="orders", sql="select * from edited")
        draft = _scoped(MetricFactory, "avg_amount", "avg(amount)")

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

    def test_nesting_survives_the_model_dump_round_trip_the_commit_gate_makes(self):
        from visivo.models.project import Project

        draft = _scoped(MetricFactory, "avg_amount", "avg(amount)")

        project = _overlay(_flask_app(_project(), metric={"avg_amount": draft}))
        rebuilt = Project(**project.model_dump(exclude_none=True))

        (nested,) = rebuilt.models[0].metrics
        assert nested._parent_name == "orders"
        assert rebuilt.metrics in (None, [])


class TestQualifiedReferences:
    def test_a_model_scoped_metric_resolves_through_its_qualified_reference(self, schema_dir):
        draft = _scoped(MetricFactory, "avg_amount", "avg(amount)")
        flask_app = _flask_app(_project(), metric={"avg_amount": draft})
        output_dir = schema_dir(flask_app.project.models[0], {"amount": "DOUBLE"})

        project = _overlay(flask_app)
        resolver = FieldResolver(dag=project.dag(), output_dir=output_dir, native_dialect="duckdb")

        assert "AVG(" in resolver.resolve("${ref(orders).avg_amount}", alias=False).upper()

    def test_a_computed_field_is_not_replaced_by_the_column_it_shadows(self, schema_dir):
        draft = _scoped(DimensionFactory, "region", "upper(region)")
        flask_app = _flask_app(_project(), dimension={"region": draft})
        output_dir = schema_dir(flask_app.project.models[0], {"region": "VARCHAR"})

        project = _overlay(flask_app)
        resolver = FieldResolver(dag=project.dag(), output_dir=output_dir, native_dialect="duckdb")

        assert "UPPER(" in resolver.resolve("${ref(orders).region}", alias=False).upper()


class TestRenestOnItsOwn:
    def test_it_is_idempotent(self):
        draft = _scoped(MetricFactory, "avg_amount", "avg(amount)")
        project = _overlay(_flask_app(_project(), metric={"avg_amount": draft}))

        renest_model_scoped_fields(project)

        assert [m.name for m in project.models[0].metrics] == ["avg_amount"]
        assert project.metrics == []

    def test_a_project_with_no_models_does_not_blow_up(self):
        orphan = _scoped(MetricFactory, "orphan", "count(*)", parent="gone")
        project = _project()
        project.models = []
        project.metrics = [orphan]

        renest_model_scoped_fields(project)

        assert [m.name for m in project.metrics] == ["orphan"]


def test_fields_limits_the_overlay_to_the_named_project_fields():
    cached_model = SqlModelFactory(name="cached_model")
    cached_metric = MetricFactory(name="cached_metric")
    app = _flask_app(
        _project(),
        model={"cached_model": cached_model},
        metric={"cached_metric": cached_metric},
    )
    project = deepcopy(app.project)

    inject_cached_objects(app, project, fields=("models",))

    assert "cached_model" in {m.name for m in project.models}
    assert "cached_metric" not in {m.name for m in project.metrics or []}


class TestADraftReplacesOnlyTheObjectWithItsScope:
    """A project-level draft and a model's inline field of the same name are two
    objects. Swapping one for the other by name made preview compute the wrong
    expression while the build used the right one."""

    def _project_with_inline(self):
        model = SqlModelFactory(
            name="orders", metrics=[MetricFactory(name="total_units", expression="sum(units)")]
        )
        return _project(models=[model])

    def test_a_project_level_draft_does_not_replace_the_inline_metric(self):
        draft = MetricFactory(name="total_units", expression="sum(${ref(orders).amount})")

        project = _overlay(_flask_app(self._project_with_inline(), metric={"total_units": draft}))

        (inline,) = project.models[0].metrics
        assert inline.expression == "sum(units)"
        assert [m.expression for m in project.metrics] == ["sum(${ref(orders).amount})"]

    def test_a_draft_of_the_inline_metric_replaces_it(self):
        draft = _scoped(MetricFactory, "total_units", "max(units)")

        project = _overlay(_flask_app(self._project_with_inline(), metric={"total_units": draft}))

        (inline,) = project.models[0].metrics
        assert inline.expression == "max(units)"
        assert project.metrics in (None, [])
