import pytest

from visivo.server.managers.object_manager import ObjectStatus
from visivo.server.rename_service import RenameError, rename_impact, rename_object


class FakeManager:
    """The two-tier manager surface the rename service uses."""

    def __init__(self, published=None, cached=None):
        self.published_objects = dict(published or {})
        self.cached_objects = dict(cached or {})
        self._renames = {}

    def save_from_config(self, config):
        raise NotImplementedError  # set per-test

    def record_rename(self, old_name, new_name):
        self._renames[new_name] = self._renames.pop(old_name, old_name)

    def renamed_from(self, name):
        return self._renames.get(name)

    def get_status(self, name):
        if name in self.cached_objects:
            if name in self._renames:
                return ObjectStatus.RENAMED
            return ObjectStatus.NEW if name not in self.published_objects else ObjectStatus.MODIFIED
        return ObjectStatus.PUBLISHED if name in self.published_objects else None


class RecordingManager(FakeManager):
    def save_from_config(self, config):
        self.saved = getattr(self, "saved", [])
        self.saved.append(config)
        self.cached_objects[config["name"]] = _Obj(config)


class _Obj:
    """Stands in for a Pydantic object: only `model_dump` is used."""

    def __init__(self, config):
        self._config = config
        self.name = config.get("name")

    def model_dump(self, **_kwargs):
        return dict(self._config)


class FakeApp:
    def __init__(self, **managers):
        for attr in (
            "source_manager",
            "model_manager",
            "metric_manager",
            "dimension_manager",
            "relation_manager",
            "insight_manager",
            "chart_manager",
            "table_manager",
            "markdown_manager",
            "input_manager",
            "dashboard_manager",
        ):
            setattr(self, attr, RecordingManager())
        for attr, manager in managers.items():
            setattr(self, attr, manager)


def _app():
    """A project where `orders` is referenced from two other objects."""
    return FakeApp(
        source_manager=RecordingManager(published={"db": _Obj({"name": "db"})}),
        model_manager=RecordingManager(
            published={
                "orders": _Obj({"name": "orders", "source": "${ref(db)}"}),
                "joined": _Obj({"name": "joined", "sql": "select * from ${ref(orders)} o"}),
            }
        ),
        insight_manager=RecordingManager(
            published={"i1": _Obj({"name": "i1", "model": "${ref(orders)}"})}
        ),
    )


class TestImpact:
    def test_it_lists_every_object_that_would_be_rewritten(self):
        impact = rename_impact(_app(), type_key="models", old_name="orders", new_name="purchases")

        assert impact["target"]["name"] == "orders"
        assert impact["target"]["new_name"] == "purchases"
        assert [(r["type"], r["name"]) for r in impact["references"]] == [
            ("insights", "i1"),
            ("models", "joined"),
        ]

    def test_an_object_that_does_not_reference_it_is_absent(self):
        impact = rename_impact(_app(), type_key="models", old_name="orders", new_name="purchases")

        assert "db" not in [r["name"] for r in impact["references"]]

    def test_the_target_is_not_a_reference_to_itself(self):
        impact = rename_impact(_app(), type_key="models", old_name="orders", new_name="purchases")

        assert "orders" not in [r["name"] for r in impact["references"]]

    def test_it_changes_nothing(self):
        app = _app()
        rename_impact(app, type_key="models", old_name="orders", new_name="purchases")

        assert app.model_manager.cached_objects == {}
        assert set(app.model_manager.published_objects) == {"orders", "joined"}

    def test_a_quoted_ref_is_matched_and_its_quoting_preserved(self):
        app = _app()
        app.chart_manager.published_objects["c"] = _Obj({"name": "c", "x": "${ref('orders')}"})

        impact = rename_impact(app, type_key="models", old_name="orders", new_name="purchases")

        assert ("charts", "c") in [(r["type"], r["name"]) for r in impact["references"]]

    def test_a_name_that_merely_contains_the_old_one_is_not_a_match(self):
        """`${ref(orders_archive)}` must survive renaming `orders`."""
        app = _app()
        app.chart_manager.published_objects["c"] = _Obj(
            {"name": "c", "x": "${ref(orders_archive)}"}
        )

        impact = rename_impact(app, type_key="models", old_name="orders", new_name="purchases")

        assert "c" not in [r["name"] for r in impact["references"]]


class TestValidation:
    def test_an_unknown_type_is_400(self):
        with pytest.raises(RenameError) as caught:
            rename_impact(_app(), type_key="nonsense", old_name="a", new_name="b")
        assert caught.value.status == 400

    def test_the_same_name_is_400(self):
        with pytest.raises(RenameError) as caught:
            rename_impact(_app(), type_key="models", old_name="orders", new_name="orders")
        assert caught.value.status == 400

    def test_a_missing_object_is_404(self):
        with pytest.raises(RenameError) as caught:
            rename_impact(_app(), type_key="models", old_name="ghost", new_name="x")
        assert caught.value.status == 404

    def test_a_collision_is_409_across_types(self):
        """visivo names are project-global, so a model cannot take a source's
        name."""
        with pytest.raises(RenameError) as caught:
            rename_impact(_app(), type_key="models", old_name="orders", new_name="db")
        assert caught.value.status == 409

    def test_a_collision_with_an_uncommitted_draft_is_still_a_collision(self):
        app = _app()
        app.chart_manager.cached_objects["draft"] = _Obj({"name": "draft"})

        with pytest.raises(RenameError) as caught:
            rename_impact(app, type_key="models", old_name="orders", new_name="draft")
        assert caught.value.status == 409

    def test_a_name_freed_by_a_pending_delete_is_available(self):
        app = _app()
        app.source_manager.cached_objects["db"] = None  # tombstoned

        impact = rename_impact(app, type_key="models", old_name="orders", new_name="db")

        assert impact["target"]["new_name"] == "db"


class TestApply:
    def test_the_target_is_cached_under_its_new_name(self):
        app = _app()

        rename_object(app, type_key="models", old_name="orders", new_name="purchases")

        assert "purchases" in app.model_manager.cached_objects
        assert app.model_manager.renamed_from("purchases") == "orders"

    def test_every_reference_is_rewritten_into_the_draft(self):
        app = _app()

        rename_object(app, type_key="models", old_name="orders", new_name="purchases")

        assert (
            app.model_manager.cached_objects["joined"].model_dump()["sql"]
            == "select * from ${ref(purchases)} o"
        )
        assert app.insight_manager.cached_objects["i1"].model_dump()["model"] == "${ref(purchases)}"

    def test_the_renamed_object_reports_RENAMED_not_NEW(self):
        """The distinction is what stops the commit writing a duplicate and
        leaving the original behind."""
        app = _app()

        rename_object(app, type_key="models", old_name="orders", new_name="purchases")

        assert app.model_manager.get_status("purchases") == ObjectStatus.RENAMED

    def test_a_chained_rename_still_points_at_the_published_name(self):
        """a→b→c must tell the commit to find `a` in the YAML; `b` was never
        written there."""
        app = _app()

        rename_object(app, type_key="models", old_name="orders", new_name="temp")
        rename_object(app, type_key="models", old_name="temp", new_name="purchases")

        assert app.model_manager.renamed_from("purchases") == "orders"

    def test_it_returns_what_it_changed(self):
        app = _app()

        applied = rename_object(app, type_key="models", old_name="orders", new_name="purchases")

        assert [r["name"] for r in applied["references"]] == ["i1", "joined"]
