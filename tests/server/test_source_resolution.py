"""One draft-first lookup for every surface that takes a source, model or
input name."""

from unittest.mock import Mock

from visivo.models.base.context_string import ContextString
from visivo.models.defaults import Defaults
from visivo.server import source_resolution as res
from tests.factories.model_factories import DuckdbSourceFactory, SqlModelFactory


def _app(
    draft_sources=(),
    committed_sources=(),
    draft_models=(),
    committed_models=(),
    draft_inputs=(),
    committed_inputs=(),
):
    app = Mock()
    app.source_manager.get.side_effect = lambda n: next(
        (s for s in draft_sources if s.name == n), None
    )
    app.model_manager.get.side_effect = lambda n: next(
        (m for m in draft_models if m.name == n), None
    )
    app.input_manager.get.side_effect = lambda n: next(
        (i for i in draft_inputs if i.name == n), None
    )
    app.project.sources = list(committed_sources)
    app.project.models = list(committed_models)
    app.project.inputs = list(committed_inputs)
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

    def test_a_source_marked_for_deletion_is_none(self):
        from visivo.server.managers.source_manager import SourceManager

        committed = DuckdbSourceFactory(name="gone")
        manager = SourceManager()
        manager._published_objects = {"gone": committed, "wh": DuckdbSourceFactory(name="wh")}
        manager.mark_for_deletion("gone")
        app = Mock()
        app.source_manager = manager
        app.project.sources = list(manager._published_objects.values())

        assert res.find_source(app, "gone") is None
        assert res.find_source(app, "wh").name == "wh"

    def test_a_status_lookup_that_raises_is_not_a_deletion(self):
        app = _app([], [DuckdbSourceFactory(name="wh")])
        app.source_manager.get_status.side_effect = RuntimeError("boom")

        assert res.find_source(app, "wh").name == "wh"


class TestFindModel:
    def test_draft_then_committed(self):
        draft, committed = SqlModelFactory(name="m"), SqlModelFactory(name="m")

        assert (
            res.find_model(_app(draft_models=[draft], committed_models=[committed]), "m") is draft
        )
        assert res.find_model(_app(committed_models=[committed]), "m") is committed
        assert res.find_model(_app(), "m") is None


class TestFindInput:
    def test_draft_then_committed(self):
        draft, committed = Mock(), Mock()
        draft.name = committed.name = "region"

        assert (
            res.find_input(_app(draft_inputs=[draft], committed_inputs=[committed]), "region")
            is draft
        )
        assert res.find_input(_app(committed_inputs=[committed]), "region") is committed
        assert res.find_input(_app(), "region") is None


class TestListSources:
    def test_drafts_are_listed_and_deleted_sources_are_not(self):
        from visivo.server.managers.source_manager import SourceManager

        published = DuckdbSourceFactory(name="wh")
        draft = DuckdbSourceFactory(name="draft_wh")
        manager = SourceManager()
        manager._published_objects = {"wh": published, "gone": DuckdbSourceFactory(name="gone")}
        manager.save("draft_wh", draft)
        manager.mark_for_deletion("gone")
        app = Mock()
        app.source_manager = manager

        assert sorted(s.name for s in res.list_sources(app)) == ["draft_wh", "wh"]

    def test_falls_back_to_the_committed_project(self):
        committed = DuckdbSourceFactory(name="wh")
        app = Mock(spec=["project"])
        app.project.sources = [committed]

        assert res.list_sources(app) == [committed]

    def test_a_manager_that_raises_falls_back_to_the_committed_project(self):
        committed = DuckdbSourceFactory(name="wh")
        app = _app(committed_sources=[committed])
        app.source_manager.get_sources_list.side_effect = RuntimeError("boom")

        assert res.list_sources(app) == [committed]


class TestFindObject:
    def test_the_three_wrappers_share_one_walk(self):
        source = DuckdbSourceFactory(name="wh")
        app = _app(committed_sources=[source])

        assert res.find_object(app, "source_manager", "sources", "wh") is source
        assert res.find_object(app, "source_manager", "sources", "") is None
        assert res.find_object(app, "model_manager", "sources", "wh") is source


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


class TestSourceForModel:
    def test_the_dag_answer_wins(self):
        app = _app()
        source = DuckdbSourceFactory(name="wh")
        app.project.dag.return_value = "dag"
        import visivo.jobs.utils as utils

        original = utils.get_source_for_model
        utils.get_source_for_model = lambda model, dag, output_dir: source
        try:
            assert res.source_for_model(app, SqlModelFactory(name="m"), "/tmp") is source
        finally:
            utils.get_source_for_model = original

    def test_falls_back_to_the_models_own_ref(self):
        source = DuckdbSourceFactory(name="wh")
        app = _app(committed_sources=[source])
        app.project.dag.side_effect = RuntimeError("not in the dag")

        model = SqlModelFactory(name="m", source="ref(wh)")
        assert res.source_for_model(app, model, "/tmp") is source

    def test_none_when_nothing_resolves(self):
        app = _app()
        app.project.dag.side_effect = RuntimeError("no dag")

        assert (
            res.source_for_model(app, SqlModelFactory(name="m", source="ref(ghost)"), "/tmp")
            is None
        )


class TestDefaultSourceName:
    def test_reads_the_committed_defaults(self):
        app = _app()
        app._cached_defaults = None
        app.project.defaults = Defaults(source_name="wh")

        assert res.default_source_name(app) == "wh"

    def test_draft_defaults_win_over_the_committed_ones(self):
        app = _app()
        app._cached_defaults = Defaults(source_name="draft_wh")
        app.project.defaults = Defaults(source_name="wh")

        assert res.default_source_name(app) == "draft_wh"

    def test_none_when_no_default_is_set(self):
        app = _app()
        app._cached_defaults = None
        app.project.defaults = None

        assert res.default_source_name(app) is None
        app.project.defaults = Defaults()
        assert res.default_source_name(app) is None

    def test_default_source_resolves_a_draft_source(self):
        draft = DuckdbSourceFactory(name="wh")
        app = _app(draft_sources=[draft])
        app._cached_defaults = Defaults(source_name="wh")

        assert res.default_source(app) is draft


class TestSourceForModelDefaults:
    """A SQL model with no ``source:`` reads from ``defaults.source_name``. The
    DAG wires that edge for a committed model; a draft model is not in the DAG."""

    def _draft_app(self, sources, default):
        app = _app(draft_sources=sources)
        app.project.dag.side_effect = RuntimeError("not in the dag")
        app._cached_defaults = None
        app.project.defaults = Defaults(source_name=default)
        return app

    def test_a_draft_model_without_a_source_uses_the_default(self):
        source = DuckdbSourceFactory(name="wh")
        app = self._draft_app([source], "wh")

        model = SqlModelFactory(name="m", source=None)
        assert res.source_for_model(app, model, "/tmp") is source

    def test_an_explicit_source_that_does_not_resolve_is_not_replaced_by_the_default(self):
        app = self._draft_app([DuckdbSourceFactory(name="wh")], "wh")

        model = SqlModelFactory(name="m", source="ref(ghost)")
        assert res.source_for_model(app, model, "/tmp") is None

    def test_a_model_that_is_not_a_sql_model_gets_no_default(self):
        app = self._draft_app([DuckdbSourceFactory(name="wh")], "wh")

        assert res.source_for_model(app, Mock(source=None), "/tmp") is None
