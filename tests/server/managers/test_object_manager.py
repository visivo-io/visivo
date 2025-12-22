import pytest
from visivo.server.managers.object_manager import ObjectManager, ObjectStatus


class ConcreteObjectManager(ObjectManager[dict]):
    """Concrete implementation for testing the abstract ObjectManager."""

    def validate_object(self, obj_data: dict) -> dict:
        """Simple validation that returns the object as-is."""
        if "name" not in obj_data:
            raise ValueError("Object must have a 'name' field")
        return obj_data

    def extract_from_project(self, project) -> None:
        """Extract objects from a mock project."""
        self._published_objects.clear()
        for obj in getattr(project, "objects", []):
            if isinstance(obj, dict) and "name" in obj:
                self._published_objects[obj["name"]] = obj


class MockProject:
    """Mock project for testing."""

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
        """Test that load() populates published_objects from project."""
        manager = ConcreteObjectManager()
        project = MockProject(objects=[{"name": "obj1", "value": 1}, {"name": "obj2", "value": 2}])

        manager.load(project)

        assert len(manager.published_objects) == 2
        assert "obj1" in manager.published_objects
        assert "obj2" in manager.published_objects

    def test_load_clears_existing_published_objects(self):
        """Test that load() clears existing published_objects."""
        manager = ConcreteObjectManager()
        manager._published_objects["old"] = {"name": "old"}
        project = MockProject(objects=[{"name": "new"}])

        manager.load(project)

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
