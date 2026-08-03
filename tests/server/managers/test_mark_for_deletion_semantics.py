"""Deleting an object that was never published removes it outright.

Normally a delete is a tombstone: `None` in the cache, which `get_status` reads
as DELETED so the commit knows to remove it from YAML. That is right for a
published object.

It is wrong for one created in this session and never published. There is
nothing in YAML to remove, so there is no change to stage — and the `None`
placeholder lingered in the cache, keeping the object in listings and making a
just-created object look undeletable.
"""

import pytest

from visivo.server.managers.object_manager import ObjectManager, ObjectStatus


class _Manager(ObjectManager[dict]):
    """Concrete stand-in — the behaviour under test is on the base class."""

    def validate_object(self, obj_data: dict) -> dict:
        return obj_data

    def extract_from_dag(self, dag) -> None:
        pass


@pytest.fixture
def manager():
    return _Manager()


def _put(manager, name, published=False):
    obj = {"name": name}
    if published:
        manager._published_objects[name] = obj
    manager._cached_objects[name] = obj
    return obj


def test_a_never_published_object_is_dropped_entirely(manager):
    _put(manager, "new_dimension")

    assert manager.mark_for_deletion("new_dimension") is True

    # Not tombstoned — gone. A lingering None kept it in listings.
    assert "new_dimension" not in manager._cached_objects
    assert manager.get_status("new_dimension") is None


def test_a_published_object_is_tombstoned_for_the_commit(manager):
    _put(manager, "region", published=True)

    assert manager.mark_for_deletion("region") is True

    assert manager._cached_objects["region"] is None
    assert manager.get_status("region") == ObjectStatus.DELETED


def test_deleting_a_published_object_with_no_cached_edit_still_tombstones(manager):
    manager._published_objects["amount"] = {"name": "amount"}

    assert manager.mark_for_deletion("amount") is True

    assert manager._cached_objects["amount"] is None
    assert manager.get_status("amount") == ObjectStatus.DELETED


def test_an_unknown_name_reports_false(manager):
    assert manager.mark_for_deletion("nope") is False
