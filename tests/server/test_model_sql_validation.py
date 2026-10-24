"""The dialect a model's SQL and an insight's static filters are judged in."""

from types import SimpleNamespace

from tests.factories.model_factories import SourceFactory
from visivo.models.insight import Insight
from visivo.models.interaction import InsightInteraction
from visivo.models.props.insight_props import InsightProps
from visivo.server.managers.model_manager import ModelManager
from visivo.server.managers.source_manager import SourceManager
from visivo.server.model_sql_validation import (
    dialect_for_insight,
    dialect_for_model,
    source_ref_name,
    validate_model_sql,
)


def _app(sources=(), models=(), project_sources=()):
    source_manager = SourceManager()
    for source in sources:
        source_manager._published_objects[source.name] = source
    model_manager = ModelManager()
    for model in models:
        model_manager._published_objects[model.name] = model
    project = SimpleNamespace(sources=list(project_sources), defaults=None)
    return SimpleNamespace(
        source_manager=source_manager, model_manager=model_manager, project=project
    )


def _insight(x="?{ ${ref(sales).region} }", filter_text=None):
    interactions = [InsightInteraction(filter=filter_text)] if filter_text else None
    return Insight(name="i", props=InsightProps(type="bar", x=x), interactions=interactions)


class TestDialectForInsight:
    def test_the_first_model_it_refs_gives_its_source_dialect(self):
        source = SourceFactory(name="wh")
        sales = ModelManager().validate_object(
            {"name": "sales", "sql": "select 1 as region", "source": "ref(wh)"}
        )
        app = _app(sources=[source], models=[sales])

        assert dialect_for_insight(app, _insight()) == source.get_sqlglot_dialect()

    def test_a_ref_that_is_not_a_model_gives_none(self):
        assert dialect_for_insight(_app(), _insight(x="?{ ${ref(total).x} }")) is None

    def test_an_app_without_a_model_manager_gives_none(self):
        assert dialect_for_insight(SimpleNamespace(), _insight()) is None


class TestSourceResolution:
    def test_a_literal_source_name_is_read(self):
        assert source_ref_name("wh") == "wh"
        assert source_ref_name("ref(wh)") == "wh"
        assert source_ref_name("  ") is None

    def test_a_source_only_in_the_parsed_project_resolves(self):
        source = SourceFactory(name="wh")
        app = _app(project_sources=[source])

        assert dialect_for_model(app, {"source": "ref(wh)"}) == source.get_sqlglot_dialect()

    def test_a_source_manager_that_fails_falls_back_to_the_project(self):
        source = SourceFactory(name="wh")
        app = _app(project_sources=[source])

        def broken(name):
            raise RuntimeError("store unavailable")

        app.source_manager.get = broken

        assert dialect_for_model(app, {"source": "ref(wh)"}) == source.get_sqlglot_dialect()

    def test_a_source_without_a_dialect_gives_none(self):
        class NoDialect:
            name = "wh"

            def get_sqlglot_dialect(self):
                raise NotImplementedError

        app = _app(project_sources=[NoDialect()])

        assert dialect_for_model(app, {"source": "ref(wh)"}) is None


class TestValidateModelSql:
    def test_sql_that_no_dialect_parses_is_refused_under_an_unknown_dialect(self):
        problem = validate_model_sql("SELEC 1 AS x", "not_a_dialect", "m")

        assert "has SQL that does not parse" in problem
