"""Which dialect a model's SQL is checked in, and the parse fallbacks."""

from unittest.mock import Mock

from visivo.models.base.context_string import ContextString
from visivo.models.defaults import Defaults
from visivo.server.model_sql_validation import (
    dialect_for_model,
    source_ref_name,
    validate_model_sql,
)
from tests.factories.model_factories import DuckdbSourceFactory


def _app(draft_sources=(), committed_sources=(), defaults=None, draft_defaults=None):
    app = Mock()
    app.source_manager.get.side_effect = lambda n: next(
        (s for s in draft_sources if s.name == n), None
    )
    app.project.sources = list(committed_sources)
    app.project.defaults = defaults
    app._cached_defaults = draft_defaults
    return app


class TestSourceRefName:
    def test_every_spelling_of_the_field(self):
        assert source_ref_name(ContextString("${ref(wh)}")) == "wh"
        assert source_ref_name("${ref(wh)}") == "wh"
        assert source_ref_name("ref(wh)") == "wh"
        assert source_ref_name("  wh  ") == "wh"

    def test_nothing_usable_is_none(self):
        assert source_ref_name(None) is None
        assert source_ref_name("   ") is None
        assert source_ref_name(DuckdbSourceFactory()) is None


class TestDialectForModel:
    def test_the_models_own_source_wins(self):
        app = _app(committed_sources=[DuckdbSourceFactory(name="wh")])

        assert dialect_for_model(app, {"source": "ref(wh)"}) == "duckdb"

    def test_a_model_without_a_source_uses_the_draft_default(self):
        """VIS-1550: the draft defaults are what the model will run on once
        committed, so they decide the dialect, not the committed defaults."""
        app = _app(
            draft_sources=[DuckdbSourceFactory(name="draft_wh")],
            defaults=Defaults(source_name="missing"),
            draft_defaults=Defaults(source_name="draft_wh"),
        )

        assert dialect_for_model(app, {}) == "duckdb"

    def test_no_name_or_no_such_source_is_the_generic_dialect(self):
        assert dialect_for_model(_app(), {}) is None
        assert dialect_for_model(_app(), {"source": "ref(ghost)"}) is None

    def test_a_source_whose_dialect_fails_is_the_generic_dialect(self):
        broken = Mock()
        broken.name = "wh"
        broken.get_sqlglot_dialect.side_effect = RuntimeError("boom")

        assert dialect_for_model(_app(draft_sources=[broken]), {"source": "ref(wh)"}) is None


class TestValidateModelSql:
    def test_sql_that_no_parser_reads_is_refused_under_a_dialect_too(self):
        message = validate_model_sql("SELECT FROM WHERE ORDER (", "duckdb", "m")

        assert message.startswith("Model 'm' has SQL that does not parse")

    def test_good_sql_is_fine(self):
        assert validate_model_sql("select 1 as one", "duckdb", "m") is None
