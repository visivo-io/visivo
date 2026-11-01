from tests.factories.model_factories import ProjectFactory, SqlModelFactory
from visivo.server.managers.model_manager import ModelManager


def _dag(*models):
    return ProjectFactory(models=list(models)).dag()


def _manager(*models):
    manager = ModelManager()
    manager.load(_dag(*models))
    return manager


def test_published_from_dag_leaves_the_served_objects_alone():
    manager = _manager(SqlModelFactory(name="orders"))

    incoming = manager.published_from_dag(_dag(SqlModelFactory(name="customers")))

    assert set(incoming) == {"customers"}
    assert set(manager.published_objects) == {"orders"}


def test_a_draft_of_a_changed_object_drops_and_other_drafts_stay():
    manager = _manager(SqlModelFactory(name="orders"), SqlModelFactory(name="customers"))
    manager.save("orders", SqlModelFactory(name="orders", sql="select 1 as draft"))
    manager.save("customers", SqlModelFactory(name="customers", sql="select 2 as draft"))

    dropped = manager.drop_stale_drafts(
        _dag(
            SqlModelFactory(name="orders", sql="select * from test_table where hand_edit = 1"),
            SqlModelFactory(name="customers"),
        )
    )

    assert dropped == ["orders"]
    assert set(manager.cached_objects) == {"customers"}


def test_an_identical_recompile_drops_nothing():
    manager = _manager(SqlModelFactory(name="orders"))
    manager.save("orders", SqlModelFactory(name="orders", sql="select 1 as draft"))

    assert manager.drop_stale_drafts(_dag(SqlModelFactory(name="orders"))) == []
    assert "orders" in manager.cached_objects


def test_a_draft_of_an_object_removed_on_disk_drops():
    manager = _manager(SqlModelFactory(name="orders"))
    manager.save("orders", SqlModelFactory(name="orders", sql="select 1 as draft"))

    assert manager.drop_stale_drafts(_dag()) == ["orders"]


def test_a_deletion_draft_of_a_changed_object_drops():
    manager = _manager(SqlModelFactory(name="orders"))
    manager.mark_for_deletion("orders")

    dropped = manager.drop_stale_drafts(_dag(SqlModelFactory(name="orders", sql="select 2")))

    assert dropped == ["orders"]
    assert manager.cached_objects == {}


def test_a_new_draft_drops_when_the_same_name_appears_on_disk():
    manager = _manager()
    manager.save("orders", SqlModelFactory(name="orders", sql="select 1 as draft"))

    assert manager.drop_stale_drafts(_dag(SqlModelFactory(name="orders"))) == ["orders"]


def test_a_new_draft_stays_when_its_name_is_not_on_disk():
    manager = _manager()
    manager.save("orders", SqlModelFactory(name="orders"))

    assert manager.drop_stale_drafts(_dag(SqlModelFactory(name="customers"))) == []
    assert "orders" in manager.cached_objects


def test_a_rename_draft_drops_with_its_record_when_the_original_changes():
    manager = _manager(SqlModelFactory(name="orders"))
    manager.save("sales", SqlModelFactory(name="sales"))
    manager.record_rename("orders", "sales")

    dropped = manager.drop_stale_drafts(_dag(SqlModelFactory(name="orders", sql="select 2")))

    assert dropped == ["sales"]
    assert manager.cached_objects == {}
    assert manager.renames == {}


def test_a_rename_draft_drops_when_its_new_name_appears_on_disk():
    manager = _manager(SqlModelFactory(name="orders"))
    manager.save("sales", SqlModelFactory(name="sales"))
    manager.record_rename("orders", "sales")

    dropped = manager.drop_stale_drafts(
        _dag(SqlModelFactory(name="orders"), SqlModelFactory(name="sales", sql="select 3"))
    )

    assert dropped == ["sales"]


def test_an_unchanged_draft_of_a_changed_object_drops_without_being_reported():
    """It equals the old file, so keeping it would revert the file edit on commit."""
    manager = _manager(SqlModelFactory(name="orders"))
    manager.save("orders", SqlModelFactory(name="orders"))

    dropped = manager.drop_stale_drafts(_dag(SqlModelFactory(name="orders", sql="select 2")))

    assert dropped == []
    assert manager.cached_objects == {}
