import pytest
from visivo.server.repositories.exploration_repository import ExplorationRepository


class TestExplorationRepository:
    def test_create_exploration(self, empty_db_path):
        repo = ExplorationRepository(empty_db_path)
        result = repo.create_exploration("Test Exploration")

        assert result["name"] == "Test Exploration"
        assert result["id"] is not None
        assert result["sql"] == ""
        assert result["source_name"] is None
        assert result["insight_config"] is None
        assert result["left_panel_tab"] == "sources"
        assert result["active_result_tab"] == "data"
        assert result["is_editor_collapsed"] is False
        assert result["is_active"] is True
        assert result["created_at"] is not None
        assert result["updated_at"] is not None

    def test_list_explorations_ordered_by_tab_order(self, empty_db_path):
        repo = ExplorationRepository(empty_db_path)
        repo.create_exploration("First")
        repo.create_exploration("Second")
        repo.create_exploration("Third")

        explorations = repo.list_explorations()
        assert len(explorations) == 3
        assert explorations[0]["name"] == "First"
        assert explorations[1]["name"] == "Second"
        assert explorations[2]["name"] == "Third"
        assert explorations[0]["tab_order"] < explorations[1]["tab_order"]
        assert explorations[1]["tab_order"] < explorations[2]["tab_order"]

    def test_get_exploration(self, empty_db_path):
        repo = ExplorationRepository(empty_db_path)
        created = repo.create_exploration("Get Test")

        result = repo.get_exploration(created["id"])
        assert result is not None
        assert result["name"] == "Get Test"
        assert result["id"] == created["id"]

    def test_get_nonexistent_exploration_returns_none(self, empty_db_path):
        repo = ExplorationRepository(empty_db_path)
        result = repo.get_exploration("nonexistent-id")
        assert result is None

    def test_update_exploration(self, empty_db_path):
        repo = ExplorationRepository(empty_db_path)
        created = repo.create_exploration("Update Test")

        result = repo.update_exploration(
            created["id"],
            {
                "name": "Updated Name",
                "sql": "SELECT * FROM users",
                "source_name": "postgres_db",
                "left_panel_tab": "models",
                "active_result_tab": "chart",
                "is_editor_collapsed": True,
            },
        )

        assert result["name"] == "Updated Name"
        assert result["sql"] == "SELECT * FROM users"
        assert result["source_name"] == "postgres_db"
        assert result["left_panel_tab"] == "models"
        assert result["active_result_tab"] == "chart"
        assert result["is_editor_collapsed"] is True

    def test_update_exploration_insight_config_json(self, empty_db_path):
        repo = ExplorationRepository(empty_db_path)
        created = repo.create_exploration("Insight Test")

        config = {"name": "test_insight", "props": {"type": "bar"}}
        result = repo.update_exploration(created["id"], {"insight_config": config})

        assert result["insight_config"] == config
        assert result["insight_config"]["name"] == "test_insight"
        assert result["insight_config"]["props"]["type"] == "bar"

    def test_update_exploration_clear_insight_config(self, empty_db_path):
        repo = ExplorationRepository(empty_db_path)
        created = repo.create_exploration("Clear Config")

        repo.update_exploration(
            created["id"],
            {"insight_config": {"name": "test", "props": {"type": "line"}}},
        )
        result = repo.update_exploration(created["id"], {"insight_config": None})
        assert result["insight_config"] is None

    def test_update_nonexistent_returns_none(self, empty_db_path):
        repo = ExplorationRepository(empty_db_path)
        result = repo.update_exploration("nonexistent-id", {"name": "New Name"})
        assert result is None

    def test_delete_exploration(self, empty_db_path):
        repo = ExplorationRepository(empty_db_path)
        created = repo.create_exploration("Delete Test")

        success = repo.delete_exploration(created["id"])
        assert success is True

        result = repo.get_exploration(created["id"])
        assert result is None

    def test_delete_nonexistent_returns_false(self, empty_db_path):
        repo = ExplorationRepository(empty_db_path)
        success = repo.delete_exploration("nonexistent-id")
        assert success is False

    def test_auto_increment_tab_order(self, empty_db_path):
        repo = ExplorationRepository(empty_db_path)
        first = repo.create_exploration("First")
        second = repo.create_exploration("Second")

        assert second["tab_order"] == first["tab_order"] + 1

    def test_default_name(self, empty_db_path):
        repo = ExplorationRepository(empty_db_path)
        result = repo.create_exploration()
        assert result["name"] == "Untitled"
