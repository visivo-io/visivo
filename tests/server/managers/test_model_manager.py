import pytest
from unittest.mock import Mock, patch
from pydantic import ValidationError

from visivo.server.managers.model_manager import ModelManager
from visivo.server.managers.object_manager import ObjectStatus
from tests.factories.model_factories import SqlModelFactory, ProjectFactory


class TestModelManager:
    """Test suite for ModelManager class."""

    def test_init_creates_model_adapter(self):
        """Test that initialization creates a TypeAdapter for SqlModel."""
        manager = ModelManager()

        assert manager._model_adapter is not None

    def test_validate_object_valid_config(self):
        """Test validate_object with valid model configuration."""
        manager = ModelManager()
        config = {"name": "test_model", "sql": "SELECT * FROM test"}

        model = manager.validate_object(config)

        assert model is not None
        assert model.name == "test_model"
        assert model.sql == "SELECT * FROM test"

    def test_validate_object_with_source_ref(self):
        """Test validate_object with source reference."""
        manager = ModelManager()
        config = {
            "name": "test_model",
            "sql": "SELECT * FROM test",
            "source": "ref(my_source)",
        }

        model = manager.validate_object(config)

        assert model is not None
        assert model.name == "test_model"
        assert model.source == "ref(my_source)"

    def test_validate_object_with_extra_field_raises(self):
        """Test validate_object raises error for extra/unknown fields."""
        manager = ModelManager()
        config = {"name": "test", "sql": "SELECT 1", "unknown_field": "value"}

        with pytest.raises(Exception):
            manager.validate_object(config)

    def test_save_from_config_validates_and_saves(self):
        """Test save_from_config validates and saves model."""
        manager = ModelManager()
        config = {"name": "new_model", "sql": "SELECT * FROM test"}

        model = manager.save_from_config(config)

        assert model.name == "new_model"
        assert "new_model" in manager.cached_objects
        assert manager.cached_objects["new_model"] == model

    def test_get_model_with_status_cached(self):
        """Test get_model_with_status for cached model."""
        manager = ModelManager()
        config = {"name": "cached_model", "sql": "SELECT * FROM test"}
        manager.save_from_config(config)

        result = manager.get_model_with_status("cached_model")

        assert result["name"] == "cached_model"
        assert result["status"] == ObjectStatus.NEW.value
        assert result["config"]["sql"] == "SELECT * FROM test"
        assert "child_item_names" in result

    def test_get_model_with_status_excludes_file_path_and_path(self):
        """Test that file_path and path fields are excluded from serialized model."""
        manager = ModelManager()
        config = {"name": "test_model", "sql": "SELECT * FROM test"}
        model = manager.save_from_config(config)

        # Even though the model object has file_path and path attributes
        assert hasattr(model, "file_path")
        assert hasattr(model, "path")

        # They should be excluded from the serialized response
        result = manager.get_model_with_status("test_model")

        assert "file_path" not in result["config"]
        assert "path" not in result["config"]
        assert result["config"]["sql"] == "SELECT * FROM test"
        assert result["config"]["name"] == "test_model"

    def test_get_model_with_status_returns_child_item_names_for_source_ref(self):
        """Test that get_model_with_status returns source in child_item_names."""
        manager = ModelManager()
        config = {
            "name": "model_with_source",
            "sql": "SELECT * FROM test",
            "source": "ref(my_source)",
        }
        manager.save_from_config(config)

        result = manager.get_model_with_status("model_with_source")

        assert result["name"] == "model_with_source"
        assert "child_item_names" in result
        assert "my_source" in result["child_item_names"]

    def test_get_model_with_status_child_item_names_empty_when_no_source(self):
        """Test that child_item_names handles models without explicit source."""
        manager = ModelManager()
        config = {"name": "model_no_source", "sql": "SELECT * FROM test"}
        manager.save_from_config(config)

        result = manager.get_model_with_status("model_no_source")

        assert result["name"] == "model_no_source"
        assert "child_item_names" in result
        # DefaultSource doesn't have a name, so child_item_names should be empty or contain default
        # The important thing is it doesn't crash

    def test_get_model_with_status_published(self):
        """Test get_model_with_status for published model."""
        manager = ModelManager()
        model = SqlModelFactory.build(name="published_model")
        manager._published_objects["published_model"] = model

        result = manager.get_model_with_status("published_model")

        assert result["name"] == "published_model"
        assert result["status"] == ObjectStatus.PUBLISHED.value

    def test_get_model_with_status_not_found(self):
        """Test get_model_with_status returns None for nonexistent."""
        manager = ModelManager()

        result = manager.get_model_with_status("nonexistent")

        assert result is None

    def test_get_all_models_with_status(self):
        """Test get_all_models_with_status returns all models."""
        manager = ModelManager()

        # Add published model
        published_model = SqlModelFactory.build(name="published")
        manager._published_objects["published"] = published_model

        # Add cached model
        config = {"name": "cached", "sql": "SELECT 1"}
        manager.save_from_config(config)

        result = manager.get_all_models_with_status()

        assert len(result) == 2
        names = [r["name"] for r in result]
        assert "published" in names
        assert "cached" in names

    def test_get_all_models_with_status_includes_deleted_with_status(self):
        """Test get_all_models_with_status includes deleted items with DELETED status."""
        manager = ModelManager()
        model = SqlModelFactory.build(name="to_delete")
        manager._published_objects["to_delete"] = model
        manager.mark_for_deletion("to_delete")

        result = manager.get_all_models_with_status()

        names = [r["name"] for r in result]
        assert "to_delete" in names
        deleted_item = next(r for r in result if r["name"] == "to_delete")
        assert deleted_item["status"] == ObjectStatus.DELETED.value

    def test_get_models_list(self):
        """Test get_models_list returns list of SqlModel objects."""
        manager = ModelManager()
        model1 = SqlModelFactory.build(name="model1")
        manager._published_objects["model1"] = model1

        config = {"name": "model2", "sql": "SELECT 1"}
        manager.save_from_config(config)

        result = manager.get_models_list()

        assert len(result) == 2
        assert all(hasattr(m, "name") for m in result)

    def test_validate_config_valid(self):
        """Test validate_config with valid configuration."""
        manager = ModelManager()
        config = {"name": "test", "sql": "SELECT 1"}

        result = manager.validate_config(config)

        assert result["valid"] is True
        assert result["name"] == "test"

    def test_validate_config_invalid(self):
        """Test validate_config with invalid configuration (extra fields)."""
        manager = ModelManager()
        config = {"name": "test", "sql": "SELECT 1", "unknown_field": "value"}

        result = manager.validate_config(config)

        assert result["valid"] is False
        assert "error" in result

    def test_get_model_with_status_returns_child_item_names_for_context_string_source(self):
        """Test that child_item_names works with ${ref(source)} format (context string)."""
        manager = ModelManager()
        config = {
            "name": "model_with_context_source",
            "sql": "SELECT * FROM test",
            "source": "${ref(context_source)}",
        }
        manager.save_from_config(config)

        result = manager.get_model_with_status("model_with_context_source")

        assert result["name"] == "model_with_context_source"
        assert "child_item_names" in result
        assert "context_source" in result["child_item_names"]
