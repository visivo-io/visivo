import pytest
from visivo.server.managers.object_manager import ObjectManager, ObjectStatus


class ConcreteObjectManager(ObjectManager[dict]):
    """Concrete implementation for testing the abstract ObjectManager."""

    def validate_object(self, obj_data: dict) -> dict:
        """Simple validation that returns the object as-is."""
        if "name" not in obj_data:
            raise ValueError("Object must have a 'name' field")
        return obj_data

    def extract_from_dag(self, dag) -> None:
        """Extract objects from a mock DAG."""
        self._published_objects.clear()
        for obj in getattr(dag, "objects", []):
            if isinstance(obj, dict) and "name" in obj:
                self._published_objects[obj["name"]] = obj


class MockDag:
    """Mock DAG for testing."""

    def __init__(self, objects=None):
        self.objects = objects or []


class TestObjectManager:
    """Test suite for ObjectManager base class."""

    def test_init_creates_empty_dicts(self):
        """Test that initialization creates empty cached and published dicts."""
        manager = ConcreteObjectManager()

        assert manager.cached_objects == {}
        assert manager.published_objects == {}

    def test_save_adds_to_cached_objects(self):
        """Test that save() adds object to cached_objects."""
        manager = ConcreteObjectManager()
        obj = {"name": "test", "value": 123}

        manager.save("test", obj)

        assert "test" in manager.cached_objects
        assert manager.cached_objects["test"] == obj

    def test_save_overwrites_existing_cached_object(self):
        """Test that save() overwrites existing cached object."""
        manager = ConcreteObjectManager()
        obj1 = {"name": "test", "value": 1}
        obj2 = {"name": "test", "value": 2}

        manager.save("test", obj1)
        manager.save("test", obj2)

        assert manager.cached_objects["test"] == obj2

    def test_load_populates_published_objects(self):
        """Test that load() populates published_objects from DAG."""
        manager = ConcreteObjectManager()
        dag = MockDag(objects=[{"name": "obj1", "value": 1}, {"name": "obj2", "value": 2}])

        manager.load(dag)

        assert len(manager.published_objects) == 2
        assert "obj1" in manager.published_objects
        assert "obj2" in manager.published_objects

    def test_load_clears_existing_published_objects(self):
        """Test that load() clears existing published_objects."""
        manager = ConcreteObjectManager()
        manager._published_objects["old"] = {"name": "old"}
        dag = MockDag(objects=[{"name": "new"}])

        manager.load(dag)

        assert "old" not in manager.published_objects
        assert "new" in manager.published_objects

    def test_get_returns_cached_over_published(self):
        """Test that get() returns cached object when both exist."""
        manager = ConcreteObjectManager()
        cached_obj = {"name": "test", "source": "cached"}
        published_obj = {"name": "test", "source": "published"}
        manager._cached_objects["test"] = cached_obj
        manager._published_objects["test"] = published_obj

        result = manager.get("test")

        assert result == cached_obj

    def test_get_returns_published_when_no_cached(self):
        """Test that get() returns published object when no cached exists."""
        manager = ConcreteObjectManager()
        published_obj = {"name": "test", "source": "published"}
        manager._published_objects["test"] = published_obj

        result = manager.get("test")

        assert result == published_obj

    def test_get_returns_none_when_not_found(self):
        """Test that get() returns None when object doesn't exist."""
        manager = ConcreteObjectManager()

        result = manager.get("nonexistent")

        assert result is None

    def test_get_all_objects_merges_cached_and_published(self):
        """Test that get_all_objects() merges cached and published."""
        manager = ConcreteObjectManager()
        manager._cached_objects["cached_only"] = {"name": "cached_only"}
        manager._cached_objects["both"] = {"name": "both", "source": "cached"}
        manager._published_objects["published_only"] = {"name": "published_only"}
        manager._published_objects["both"] = {"name": "both", "source": "published"}

        result = manager.get_all_objects()

        assert len(result) == 3
        assert result["cached_only"] == {"name": "cached_only"}
        assert result["published_only"] == {"name": "published_only"}
        assert result["both"]["source"] == "cached"  # cached takes priority

    def test_get_all_objects_list_returns_list(self):
        """Test that get_all_objects_list() returns a list."""
        manager = ConcreteObjectManager()
        manager._cached_objects["test1"] = {"name": "test1"}
        manager._published_objects["test2"] = {"name": "test2"}

        result = manager.get_all_objects_list()

        assert isinstance(result, list)
        assert len(result) == 2

    def test_get_status_returns_new_for_cached_only(self):
        """Test that get_status() returns NEW for objects only in cache."""
        manager = ConcreteObjectManager()
        manager._cached_objects["test"] = {"name": "test"}

        status = manager.get_status("test")

        assert status == ObjectStatus.NEW

    def test_get_status_returns_modified_for_both(self):
        """Test that get_status() returns MODIFIED for objects in both."""
        manager = ConcreteObjectManager()
        manager._cached_objects["test"] = {"name": "test", "modified": True}
        manager._published_objects["test"] = {"name": "test"}

        status = manager.get_status("test")

        assert status == ObjectStatus.MODIFIED

    def test_get_status_returns_published_when_cached_equals_published(self):
        """Test that get_status() returns PUBLISHED when cached equals published."""
        manager = ConcreteObjectManager()
        # Same object in both - should be considered PUBLISHED, not MODIFIED
        manager._cached_objects["test"] = {"name": "test", "value": 123}
        manager._published_objects["test"] = {"name": "test", "value": 123}

        status = manager.get_status("test")

        assert status == ObjectStatus.PUBLISHED

    def test_get_status_returns_published_for_published_only(self):
        """Test that get_status() returns PUBLISHED for objects only in published."""
        manager = ConcreteObjectManager()
        manager._published_objects["test"] = {"name": "test"}

        status = manager.get_status("test")

        assert status == ObjectStatus.PUBLISHED

    def test_get_status_returns_none_for_nonexistent(self):
        """Test that get_status() returns None for nonexistent objects."""
        manager = ConcreteObjectManager()

        status = manager.get_status("nonexistent")

        assert status is None

    def test_delete_from_cache_removes_cached_object(self):
        """Test that delete_from_cache() removes object from cache."""
        manager = ConcreteObjectManager()
        manager._cached_objects["test"] = {"name": "test"}

        result = manager.delete_from_cache("test")

        assert result is True
        assert "test" not in manager.cached_objects

    def test_delete_from_cache_returns_false_when_not_found(self):
        """Test that delete_from_cache() returns False when not in cache."""
        manager = ConcreteObjectManager()

        result = manager.delete_from_cache("nonexistent")

        assert result is False

    def test_delete_from_cache_preserves_published(self):
        """Test that delete_from_cache() does not affect published objects."""
        manager = ConcreteObjectManager()
        manager._cached_objects["test"] = {"name": "test", "source": "cached"}
        manager._published_objects["test"] = {"name": "test", "source": "published"}

        manager.delete_from_cache("test")

        assert "test" not in manager.cached_objects
        assert "test" in manager.published_objects

    def test_mark_for_deletion_sets_none_in_cache(self):
        """Test that mark_for_deletion() sets None in cache."""
        manager = ConcreteObjectManager()
        manager._published_objects["test"] = {"name": "test"}

        result = manager.mark_for_deletion("test")

        assert result is True
        assert "test" in manager.cached_objects
        assert manager.cached_objects["test"] is None

    def test_mark_for_deletion_returns_false_for_nonexistent(self):
        """Test that mark_for_deletion() returns False for nonexistent objects."""
        manager = ConcreteObjectManager()

        result = manager.mark_for_deletion("nonexistent")

        assert result is False

    def test_get_objects_for_publish_returns_cached(self):
        """Test that get_objects_for_publish() returns cached objects."""
        manager = ConcreteObjectManager()
        manager._cached_objects["test1"] = {"name": "test1"}
        manager._cached_objects["test2"] = {"name": "test2"}

        result = manager.get_objects_for_publish()

        assert len(result) == 2
        assert "test1" in result
        assert "test2" in result

    def test_clear_cache_removes_all_cached(self):
        """Test that clear_cache() removes all cached objects."""
        manager = ConcreteObjectManager()
        manager._cached_objects["test1"] = {"name": "test1"}
        manager._cached_objects["test2"] = {"name": "test2"}

        manager.clear_cache()

        assert len(manager.cached_objects) == 0

    def test_clear_cache_preserves_published(self):
        """Test that clear_cache() does not affect published objects."""
        manager = ConcreteObjectManager()
        manager._cached_objects["cached"] = {"name": "cached"}
        manager._published_objects["published"] = {"name": "published"}

        manager.clear_cache()

        assert len(manager.cached_objects) == 0
        assert "published" in manager.published_objects

    def test_has_unpublished_changes_true_when_cached(self):
        """Test that has_unpublished_changes() returns True with cached objects."""
        manager = ConcreteObjectManager()
        manager._cached_objects["test"] = {"name": "test"}

        assert manager.has_unpublished_changes() is True

    def test_has_unpublished_changes_false_when_empty_cache(self):
        """Test that has_unpublished_changes() returns False with empty cache."""
        manager = ConcreteObjectManager()
        manager._published_objects["test"] = {"name": "test"}

        assert manager.has_unpublished_changes() is False

    def test_object_status_enum_values(self):
        """Test ObjectStatus enum values."""
        assert ObjectStatus.NEW.value == "new"
        assert ObjectStatus.MODIFIED.value == "modified"
        assert ObjectStatus.PUBLISHED.value == "published"


class TestSerializeObjectShape:
    """Lock the canonical envelope returned by ``_serialize_object``.

    Every per-resource detail GET (charts, tables, dashboards, models,
    sources, insights, inputs, dimensions, metrics, relations, markdowns,
    csv-script-models, local-merge-models) flows through this helper. The
    shape is part of the public HTTP contract — both visivo's own viewer
    and the separate core SaaS depend on the exact key set being stable.

    If you find yourself updating these tests, also bump the contract docs
    so consumers know to follow.
    """

    EXPECTED_KEYS = {"id", "name", "status", "child_item_names", "config"}

    @staticmethod
    def _make_obj():
        from pydantic import BaseModel

        class _Obj(BaseModel):
            model_config = {"extra": "allow"}
            name: str = "demo"
            value: int = 42

            def child_items(self):
                return []

        return _Obj()

    def _serialize(self, status):
        manager = ConcreteObjectManager()
        return manager._serialize_object("demo", self._make_obj(), status)

    def test_envelope_keys_are_exactly_the_canonical_set(self):
        """Top-level keys must be exactly {id, name, status, child_item_names, config}.

        No more (rogue extras leak implementation details) and no fewer
        (consumers depend on every field being present, even when empty).
        """
        for status in (ObjectStatus.PUBLISHED, ObjectStatus.NEW, ObjectStatus.MODIFIED, None):
            result = self._serialize(status)
            assert set(result.keys()) == self.EXPECTED_KEYS, (
                f"Envelope drifted for status={status}: extra={set(result.keys()) - self.EXPECTED_KEYS}, "
                f"missing={self.EXPECTED_KEYS - set(result.keys())}"
            )

    def test_id_equals_name_in_single_project_mode(self):
        """Locally `id` mirrors `name`. Cloud may diverge to a UUID."""
        result = self._serialize(ObjectStatus.PUBLISHED)
        assert result["id"] == result["name"] == "demo"

    def test_status_is_string_value_or_none(self):
        """Status is the enum's string value, never the enum instance."""
        for status in (ObjectStatus.PUBLISHED, ObjectStatus.NEW, ObjectStatus.MODIFIED):
            result = self._serialize(status)
            assert result["status"] == status.value
        assert self._serialize(None)["status"] is None

    def test_child_item_names_is_a_list(self):
        """Always a list — never null. Empty list when no children."""
        result = self._serialize(ObjectStatus.PUBLISHED)
        assert isinstance(result["child_item_names"], list)
        assert result["child_item_names"] == []

    def test_child_item_names_recurses_through_anonymous_containers(self):
        """Container children (Row, Item) without a ``name`` should be
        traversed so the leaf names underneath show up in
        ``child_item_names`` directly. Without this, dashboards report
        no children — and the per-resource lazy-fetch path can't tell
        which charts/tables/markdowns/inputs a given dashboard needs.
        """
        from pydantic import BaseModel

        class _Leaf(BaseModel):
            model_config = {"extra": "allow"}
            name: str

            def child_items(self):
                return []

        class _AnonContainer(BaseModel):
            """Mimics Row/Item — a grouping node with no name."""

            model_config = {"extra": "allow"}
            kids: list

            def child_items(self):
                return self.kids

        class _Dashboard(BaseModel):
            model_config = {"extra": "allow"}
            name: str = "dash"
            rows: list

            def child_items(self):
                return self.rows

        dash = _Dashboard(
            rows=[
                _AnonContainer(kids=[_AnonContainer(kids=[_Leaf(name="chart_a")])]),
                _AnonContainer(kids=[_Leaf(name="table_b"), _Leaf(name="md_c")]),
                # Duplicate name should not appear twice.
                _AnonContainer(kids=[_Leaf(name="chart_a")]),
            ]
        )
        manager = ConcreteObjectManager()
        result = manager._serialize_object("dash", dash, ObjectStatus.PUBLISHED)

        assert result["child_item_names"] == ["chart_a", "table_b", "md_c"]

    def test_config_excludes_internal_pydantic_fields(self):
        """`config` is the model dump with internal fields stripped.

        ``file_path`` and ``path`` are visivo-internal — they describe
        where the object came from on disk, which should never be exposed
        over the API. Verify they're stripped even when the source object
        carries them.
        """
        from pydantic import BaseModel

        class _ObjWithInternals(BaseModel):
            model_config = {"extra": "allow"}
            name: str = "demo"
            file_path: str = "/some/yaml/path.visivo.yml"
            path: str = "dashboards.0"
            description: str = "kept"

            def child_items(self):
                return []

        manager = ConcreteObjectManager()
        result = manager._serialize_object("demo", _ObjWithInternals(), ObjectStatus.PUBLISHED)
        assert "file_path" not in result["config"]
        assert "path" not in result["config"]
        assert result["config"]["description"] == "kept"
