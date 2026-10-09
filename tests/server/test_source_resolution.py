"""One draft-first lookup for every surface that takes a source or model
name (VIS-1411). Three views had their own copies; this is the shared one."""

from unittest.mock import Mock

from visivo.models.base.context_string import ContextString
from visivo.server import source_resolution as res
from tests.factories.model_factories import DuckdbSourceFactory, SqlModelFactory


def _app(draft_sources=(), committed_sources=(), draft_models=(), committed_models=()):
    app = Mock()
    app.source_manager.get.side_effect = lambda n: next(
        (s for s in draft_sources if s.name == n), None
    )
    app.model_manager.get.side_effect = lambda n: next(
        (m for m in draft_models if m.name == n), None
    )
    app.project.sources = list(committed_sources)
    app.project.models = list(committed_models)
    return app


class TestFindSource:
    def test_the_draft_wins_over_the_committed_object(self):
        draft, committed = DuckdbSourceFactory(name="wh"), DuckdbSourceFactory(name="wh")

        assert res.find_source(_app([draft], [committed]), "wh") is draft

    def test_falls_back_to_the_committed_project(self):
        committed = DuckdbSourceFactory(name="wh")

        assert res.find_source(_app([], [committed]), "wh") is committed

    def test_unknown_and_empty_names_are_none(self):
        app = _app([], [DuckdbSourceFactory(name="wh")])

        assert res.find_source(app, "nope") is None
        assert res.find_source(app, "") is None
        assert res.find_source(app, None) is None

    def test_a_server_without_managers_still_reads_the_project(self):
        committed = DuckdbSourceFactory(name="wh")
        app = Mock(spec=["project"])
        app.project.sources = [committed]

        assert res.find_source(app, "wh") is committed

    def test_a_manager_that_raises_is_treated_as_a_miss(self):
        app = _app([], [DuckdbSourceFactory(name="wh")])
        app.source_manager.get.side_effect = RuntimeError("boom")

        assert res.find_source(app, "wh").name == "wh"


class TestFindModel:
    def test_draft_then_committed(self):
        draft, committed = SqlModelFactory(name="m"), SqlModelFactory(name="m")

        assert (
            res.find_model(_app(draft_models=[draft], committed_models=[committed]), "m") is draft
        )
        assert res.find_model(_app(committed_models=[committed]), "m") is committed
        assert res.find_model(_app(), "m") is None


class TestReferencedSourceName:
    def test_both_ref_spellings(self):
        assert res.referenced_source_name(Mock(source="ref(wh)")) == "wh"
        assert res.referenced_source_name(Mock(source="${ref(wh)}")) == "wh"

    def test_a_context_string(self):
        assert res.referenced_source_name(Mock(source=ContextString("${ref(wh)}"))) == "wh"

    def test_an_embedded_source_or_garbage_is_none(self):
        assert res.referenced_source_name(Mock(source=None)) is None
        assert res.referenced_source_name(Mock(source="not a ref")) is None
        assert res.referenced_source_name(Mock(source=DuckdbSourceFactory())) is None
