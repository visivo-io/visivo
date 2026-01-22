"""Tests for InputManager"""

import pytest
from pydantic import ValidationError

from visivo.models.inputs.input import Input
from visivo.models.inputs.types.single_select import SingleSelectInput
from visivo.models.inputs.types.multi_select import MultiSelectInput
from visivo.server.managers.input_manager import InputManager
from visivo.server.managers.object_manager import ObjectStatus


class TestInputManager:
    """Test suite for InputManager"""

    @pytest.fixture
    def manager(self):
        """Create a fresh InputManager instance for each test"""
        return InputManager()

    @pytest.fixture
    def valid_select_input_config(self):
        """Valid single-select input configuration"""
        return {
            "name": "test_input",
            "type": "single-select",
            "label": "Test Input",
            "options": ["Option 1", "Option 2"],
        }

    @pytest.fixture
    def valid_multiselect_input_config(self):
        """Valid multi-select input configuration"""
        return {
            "name": "categories",
            "type": "multi-select",
            "label": "Categories",
            "options": ["Category A", "Category B", "Category C"],
        }

    def test_validate_object_valid_input(self, manager, valid_select_input_config):
        """Test that validate_object accepts valid input config"""
        input_obj = manager.validate_object(valid_select_input_config)

        assert isinstance(input_obj, SingleSelectInput)
        assert input_obj.name == "test_input"
        assert input_obj.type == "single-select"
        assert input_obj.label == "Test Input"
        assert len(input_obj.options) == 2

    def test_validate_object_invalid_input(self, manager):
        """Test that validate_object raises ValidationError for invalid config"""
        invalid_config = {
            "name": "invalid_input",
            "type": "invalid_type",  # Invalid type
        }

        with pytest.raises(ValidationError):
            manager.validate_object(invalid_config)

    def test_validate_object_missing_required_field(self, manager):
        """Test that validate_object raises ValidationError when required fields missing"""
        invalid_config = {
            "type": "select",  # Missing name
            "options": [],
        }

        with pytest.raises(ValidationError):
            manager.validate_object(invalid_config)

    def test_save_from_config(self, manager, valid_select_input_config):
        """Test saving input from configuration dictionary"""
        input_obj = manager.save_from_config(valid_select_input_config)

        assert isinstance(input_obj, SingleSelectInput)
        assert input_obj.name == "test_input"

        # Verify it was saved
        retrieved = manager.get("test_input")
        assert retrieved is not None
        assert retrieved.name == "test_input"

    def test_save_from_config_invalid(self, manager):
        """Test that save_from_config raises ValidationError for invalid config"""
        invalid_config = {"name": "test", "type": "invalid"}

        with pytest.raises(ValidationError):
            manager.save_from_config(invalid_config)

    def test_get_input_with_status_new(self, manager, valid_select_input_config):
        """Test get_input_with_status for newly saved input"""
        manager.save_from_config(valid_select_input_config)

        result = manager.get_input_with_status("test_input")

        assert result is not None
        assert result["name"] == "test_input"
        assert result["status"] == ObjectStatus.NEW.value
        assert "config" in result
        assert result["config"]["type"] == "single-select"

    def test_get_input_with_status_not_found(self, manager):
        """Test get_input_with_status returns None for non-existent input"""
        result = manager.get_input_with_status("nonexistent")
        assert result is None

    def test_get_all_inputs_with_status_empty(self, manager):
        """Test get_all_inputs_with_status returns empty list when no inputs"""
        result = manager.get_all_inputs_with_status()
        assert result == []

    def test_get_all_inputs_with_status_multiple(
        self, manager, valid_select_input_config, valid_multiselect_input_config
    ):
        """Test get_all_inputs_with_status returns all inputs"""
        manager.save_from_config(valid_select_input_config)
        manager.save_from_config(valid_multiselect_input_config)

        result = manager.get_all_inputs_with_status()

        assert len(result) == 2
        names = [r["name"] for r in result]
        assert "test_input" in names
        assert "categories" in names

        # Should be sorted by name
        assert result[0]["name"] <= result[1]["name"]

    def test_get_all_inputs_with_status_includes_deleted(self, manager, valid_select_input_config):
        """Test that get_all_inputs_with_status includes deleted inputs"""
        # Save and publish an input
        input_obj = manager.save_from_config(valid_select_input_config)
        manager._published_objects["test_input"] = input_obj

        # Mark for deletion
        manager.mark_for_deletion("test_input")

        result = manager.get_all_inputs_with_status()

        assert len(result) == 1
        assert result[0]["name"] == "test_input"
        assert result[0]["status"] == ObjectStatus.DELETED.value

    def test_validate_config_valid(self, manager, valid_select_input_config):
        """Test validate_config with valid configuration"""
        result = manager.validate_config(valid_select_input_config)

        assert result["valid"] is True
        assert result["name"] == "test_input"
        assert "error" not in result

    def test_validate_config_invalid(self, manager):
        """Test validate_config with invalid configuration"""
        invalid_config = {"name": "test", "type": "invalid_type"}

        result = manager.validate_config(invalid_config)

        assert result["valid"] is False
        assert "error" in result
        assert "errors" in result

    def test_validate_config_missing_required(self, manager):
        """Test validate_config with missing required fields"""
        invalid_config = {"type": "select"}  # Missing name

        result = manager.validate_config(invalid_config)

        assert result["valid"] is False
        assert "error" in result

    def test_extract_from_dag(self, manager):
        """Test extract_from_dag clears published objects"""
        import networkx as nx

        # Create a simple input and add to published
        input_obj = SingleSelectInput(
            name="old_input", type="single-select", options=["opt1", "opt2"]
        )
        manager._published_objects["old_input"] = input_obj

        # Use an empty networkx DiGraph as a minimal DAG
        empty_dag = nx.DiGraph()
        manager.extract_from_dag(empty_dag)

        # extract_from_dag should clear published objects
        assert len(manager._published_objects) == 0

    def test_status_new_for_cached_only(self, manager, valid_select_input_config):
        """Test that status is NEW for inputs only in cache"""
        manager.save_from_config(valid_select_input_config)

        status = manager.get_status("test_input")
        assert status == ObjectStatus.NEW

    def test_status_published_for_published_only(self, manager, valid_select_input_config):
        """Test that status is PUBLISHED for inputs only in published"""
        input_obj = SingleSelectInput(**valid_select_input_config)
        manager._published_objects["test_input"] = input_obj

        status = manager.get_status("test_input")
        assert status == ObjectStatus.PUBLISHED

    def test_status_modified_for_both(self, manager, valid_select_input_config):
        """Test that status is MODIFIED when in both cache and published"""
        from visivo.models.inputs.types.single_select import SingleSelectInput

        input_obj = SingleSelectInput(**valid_select_input_config)
        manager._published_objects["test_input"] = input_obj

        # Modify and save to cache
        modified_config = valid_select_input_config.copy()
        modified_config["label"] = "Modified Label"
        manager.save_from_config(modified_config)

        status = manager.get_status("test_input")
        assert status == ObjectStatus.MODIFIED

    def test_serialize_object(self, manager, valid_select_input_config):
        """Test _serialize_object creates proper dictionary"""
        from visivo.models.inputs.types.single_select import SingleSelectInput

        input_obj = SingleSelectInput(**valid_select_input_config)

        result = manager._serialize_object("test_input", input_obj, ObjectStatus.NEW)

        assert result["name"] == "test_input"
        assert result["status"] == ObjectStatus.NEW.value
        assert "config" in result
        assert result["config"]["name"] == "test_input"
        assert result["config"]["type"] == "single-select"
        assert "path" not in result["config"]  # Should be excluded

    def test_delete_marks_for_deletion(self, manager, valid_select_input_config):
        """Test that mark_for_deletion marks input for deletion"""
        manager.save_from_config(valid_select_input_config)

        manager.mark_for_deletion("test_input")

        # Should be marked with None in cache
        assert manager._cached_objects["test_input"] is None

        # get() should return None
        assert manager.get("test_input") is None

    def test_save_overwrites_deletion_mark(self, manager, valid_select_input_config):
        """Test that saving after deletion removes deletion mark"""
        manager.save_from_config(valid_select_input_config)
        manager.mark_for_deletion("test_input")

        # Save again
        manager.save_from_config(valid_select_input_config)

        # Should no longer be marked for deletion
        retrieved = manager.get("test_input")
        assert retrieved is not None
        assert retrieved.name == "test_input"

    def test_clear_cache_preserves_published(self, manager, valid_select_input_config):
        """Test that clear_cache only clears cached objects"""
        from visivo.models.inputs.types.single_select import SingleSelectInput

        # Add to both cache and published
        input_obj = SingleSelectInput(**valid_select_input_config)
        manager._cached_objects["test_input"] = input_obj
        manager._published_objects["test_input"] = input_obj

        manager.clear_cache()

        assert len(manager._cached_objects) == 0
        assert len(manager._published_objects) == 1
        assert "test_input" in manager._published_objects
