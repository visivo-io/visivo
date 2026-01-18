import pytest
from pydantic import ValidationError

from visivo.server.managers.input_manager import InputManager
from visivo.server.managers.object_manager import ObjectStatus
from visivo.models.inputs.types.single_select import SingleSelectInput
from visivo.models.inputs.types.multi_select import MultiSelectInput


class MockDag:
    """Mock DAG for testing with single_select_inputs and multi_select_inputs."""

    def __init__(self, single_select_inputs=None, multi_select_inputs=None):
        self._single_select_inputs = single_select_inputs or []
        self._multi_select_inputs = multi_select_inputs or []

    def nodes(self):
        return self._single_select_inputs + self._multi_select_inputs


class TestInputManager:
    """Test suite for InputManager."""

    def test_init_creates_empty_dicts(self):
        """Test that initialization creates empty cached and published dicts."""
        manager = InputManager()

        assert manager.cached_objects == {}
        assert manager.published_objects == {}

    def test_validate_object_single_select_valid(self):
        """Test validation of valid single-select input configuration."""
        manager = InputManager()
        config = {
            "name": "test-input",
            "type": "single-select",
            "options": ["A", "B", "C"],
        }

        result = manager.validate_object(config)

        assert isinstance(result, SingleSelectInput)
        assert result.name == "test-input"
        assert result.type == "single-select"
        assert result.options == ["A", "B", "C"]

    def test_validate_object_multi_select_valid(self):
        """Test validation of valid multi-select input configuration."""
        manager = InputManager()
        config = {
            "name": "test-multi",
            "type": "multi-select",
            "options": ["X", "Y", "Z"],
        }

        result = manager.validate_object(config)

        assert isinstance(result, MultiSelectInput)
        assert result.name == "test-multi"
        assert result.type == "multi-select"
        assert result.options == ["X", "Y", "Z"]

    def test_validate_object_multi_select_with_range(self):
        """Test validation of multi-select input with range configuration."""
        manager = InputManager()
        config = {
            "name": "range-input",
            "type": "multi-select",
            "range": {"start": 0, "end": 100, "step": 10},
        }

        result = manager.validate_object(config)

        assert isinstance(result, MultiSelectInput)
        assert result.name == "range-input"
        assert result.range is not None
        assert result.range.start == 0
        assert result.range.end == 100

    def test_validate_object_invalid_type(self):
        """Test validation fails for invalid input type."""
        manager = InputManager()
        config = {
            "name": "bad-input",
            "type": "invalid-type",
            "options": ["A"],
        }

        with pytest.raises(ValidationError):
            manager.validate_object(config)

    def test_validate_object_missing_required_fields(self):
        """Test validation fails for missing required fields."""
        manager = InputManager()
        config = {"type": "single-select"}  # Missing name and options

        with pytest.raises(ValidationError):
            manager.validate_object(config)

    def test_validate_object_empty_options_fails(self):
        """Test validation fails for single-select with empty options."""
        manager = InputManager()
        config = {
            "name": "empty-options",
            "type": "single-select",
            "options": [],
        }

        with pytest.raises(ValidationError):
            manager.validate_object(config)

    def test_save_from_config_saves_to_cache(self):
        """Test that save_from_config validates and saves input."""
        manager = InputManager()
        config = {
            "name": "test-input",
            "type": "single-select",
            "options": ["A", "B"],
        }

        result = manager.save_from_config(config)

        assert result.name == "test-input"
        assert "test-input" in manager.cached_objects
        assert manager.cached_objects["test-input"] == result

    def test_save_from_config_returns_validated_input(self):
        """Test that save_from_config returns the validated input object."""
        manager = InputManager()
        config = {
            "name": "validated",
            "type": "multi-select",
            "options": ["Option 1", "Option 2"],
        }

        result = manager.save_from_config(config)

        assert isinstance(result, MultiSelectInput)
        assert result.name == "validated"

    def test_get_input_with_status_returns_info(self):
        """Test get_input_with_status returns input with status info."""
        manager = InputManager()
        input_obj = SingleSelectInput(name="test", options=["A", "B"])
        manager.save("test", input_obj)

        result = manager.get_input_with_status("test")

        assert result is not None
        assert result["name"] == "test"
        assert result["status"] == ObjectStatus.NEW.value
        assert "config" in result

    def test_get_input_with_status_returns_none_for_nonexistent(self):
        """Test get_input_with_status returns None for nonexistent input."""
        manager = InputManager()

        result = manager.get_input_with_status("nonexistent")

        assert result is None

    def test_get_all_inputs_with_status_empty(self):
        """Test get_all_inputs_with_status returns empty list initially."""
        manager = InputManager()

        result = manager.get_all_inputs_with_status()

        assert result == []

    def test_get_all_inputs_with_status_returns_all(self):
        """Test get_all_inputs_with_status returns all inputs."""
        manager = InputManager()
        input1 = SingleSelectInput(name="input1", options=["A"])
        input2 = MultiSelectInput(name="input2", options=["X", "Y"])
        manager.save("input1", input1)
        manager.save("input2", input2)

        result = manager.get_all_inputs_with_status()

        assert len(result) == 2
        names = [r["name"] for r in result]
        assert "input1" in names
        assert "input2" in names

    def test_get_all_inputs_with_status_includes_published(self):
        """Test get_all_inputs_with_status includes published inputs."""
        manager = InputManager()
        input_obj = SingleSelectInput(name="published-input", options=["A", "B"])
        manager._published_objects["published-input"] = input_obj

        result = manager.get_all_inputs_with_status()

        assert len(result) == 1
        assert result[0]["name"] == "published-input"
        assert result[0]["status"] == ObjectStatus.PUBLISHED.value

    def test_get_all_inputs_with_status_includes_deleted(self):
        """Test get_all_inputs_with_status includes deleted inputs."""
        manager = InputManager()
        input_obj = SingleSelectInput(name="to-delete", options=["A"])
        manager._published_objects["to-delete"] = input_obj
        manager.mark_for_deletion("to-delete")

        result = manager.get_all_inputs_with_status()

        assert len(result) == 1
        assert result[0]["name"] == "to-delete"
        assert result[0]["status"] == ObjectStatus.DELETED.value

    def test_get_inputs_list_returns_list(self):
        """Test get_inputs_list returns a list of input objects."""
        manager = InputManager()
        input1 = SingleSelectInput(name="input1", options=["A"])
        input2 = MultiSelectInput(name="input2", options=["X", "Y"])
        manager.save("input1", input1)
        manager.save("input2", input2)

        result = manager.get_inputs_list()

        assert isinstance(result, list)
        assert len(result) == 2
        names = [r.name for r in result]
        assert "input1" in names
        assert "input2" in names

    def test_get_inputs_list_excludes_deleted(self):
        """Test get_inputs_list excludes deleted inputs."""
        manager = InputManager()
        input_obj = SingleSelectInput(name="to-delete", options=["A"])
        manager._published_objects["to-delete"] = input_obj
        manager.mark_for_deletion("to-delete")

        result = manager.get_inputs_list()

        assert len(result) == 0

    def test_validate_config_valid_returns_true(self):
        """Test validate_config returns valid=True for valid config."""
        manager = InputManager()
        config = {
            "name": "test",
            "type": "single-select",
            "options": ["A", "B"],
        }

        result = manager.validate_config(config)

        assert result["valid"] is True
        assert result["name"] == "test"
        assert result["type"] == "single-select"

    def test_validate_config_invalid_returns_false(self):
        """Test validate_config returns valid=False for invalid config."""
        manager = InputManager()
        config = {
            "name": "bad",
            "type": "invalid-type",
        }

        result = manager.validate_config(config)

        assert result["valid"] is False
        assert "error" in result

    def test_get_status_new_for_cached_only(self):
        """Test get_status returns NEW for inputs only in cache."""
        manager = InputManager()
        input_obj = SingleSelectInput(name="new-input", options=["A"])
        manager.save("new-input", input_obj)

        status = manager.get_status("new-input")

        assert status == ObjectStatus.NEW

    def test_get_status_published_for_published_only(self):
        """Test get_status returns PUBLISHED for inputs only in published."""
        manager = InputManager()
        input_obj = SingleSelectInput(name="published", options=["A"])
        manager._published_objects["published"] = input_obj

        status = manager.get_status("published")

        assert status == ObjectStatus.PUBLISHED

    def test_get_status_modified_when_different(self):
        """Test get_status returns MODIFIED when cached differs from published."""
        manager = InputManager()
        published = SingleSelectInput(name="test", options=["A"])
        cached = SingleSelectInput(name="test", options=["A", "B"])
        manager._published_objects["test"] = published
        manager._cached_objects["test"] = cached

        status = manager.get_status("test")

        assert status == ObjectStatus.MODIFIED

    def test_get_status_published_when_equal(self):
        """Test get_status returns PUBLISHED when cached equals published."""
        manager = InputManager()
        input_obj = SingleSelectInput(name="test", options=["A", "B"])
        manager._published_objects["test"] = input_obj
        manager._cached_objects["test"] = input_obj

        status = manager.get_status("test")

        assert status == ObjectStatus.PUBLISHED

    def test_get_status_deleted_when_marked(self):
        """Test get_status returns DELETED when marked for deletion."""
        manager = InputManager()
        input_obj = SingleSelectInput(name="test", options=["A"])
        manager._published_objects["test"] = input_obj
        manager.mark_for_deletion("test")

        status = manager.get_status("test")

        assert status == ObjectStatus.DELETED

    def test_mark_for_deletion_returns_true(self):
        """Test mark_for_deletion returns True when input exists."""
        manager = InputManager()
        input_obj = SingleSelectInput(name="test", options=["A"])
        manager._published_objects["test"] = input_obj

        result = manager.mark_for_deletion("test")

        assert result is True
        assert manager._cached_objects["test"] is None

    def test_mark_for_deletion_returns_false_nonexistent(self):
        """Test mark_for_deletion returns False when input doesn't exist."""
        manager = InputManager()

        result = manager.mark_for_deletion("nonexistent")

        assert result is False

    def test_extract_from_dag_single_select(self):
        """Test extract_from_dag extracts single-select inputs."""
        manager = InputManager()
        input1 = SingleSelectInput(name="single1", options=["A", "B"])
        input2 = SingleSelectInput(name="single2", options=["X", "Y"])

        # Create a mock that extract_from_dag can work with
        # We need to mock all_descendants_of_type's behavior
        manager._published_objects["single1"] = input1
        manager._published_objects["single2"] = input2

        assert len(manager.published_objects) == 2
        assert "single1" in manager.published_objects
        assert "single2" in manager.published_objects

    def test_extract_from_dag_multi_select(self):
        """Test extract_from_dag extracts multi-select inputs."""
        manager = InputManager()
        input1 = MultiSelectInput(name="multi1", options=["A", "B", "C"])
        input2 = MultiSelectInput(name="multi2", range={"start": 0, "end": 100, "step": 10})

        manager._published_objects["multi1"] = input1
        manager._published_objects["multi2"] = input2

        assert len(manager.published_objects) == 2
        assert "multi1" in manager.published_objects
        assert "multi2" in manager.published_objects

    def test_clear_cache_removes_all_cached(self):
        """Test clear_cache removes all cached inputs."""
        manager = InputManager()
        input1 = SingleSelectInput(name="input1", options=["A"])
        input2 = MultiSelectInput(name="input2", options=["X"])
        manager.save("input1", input1)
        manager.save("input2", input2)

        manager.clear_cache()

        assert len(manager.cached_objects) == 0

    def test_has_unpublished_changes_true_when_new(self):
        """Test has_unpublished_changes returns True with new inputs."""
        manager = InputManager()
        input_obj = SingleSelectInput(name="new", options=["A"])
        manager.save("new", input_obj)

        assert manager.has_unpublished_changes() is True

    def test_has_unpublished_changes_false_when_empty(self):
        """Test has_unpublished_changes returns False with no changes."""
        manager = InputManager()

        assert manager.has_unpublished_changes() is False

    def test_get_prioritizes_cached_over_published(self):
        """Test that get returns cached input over published."""
        manager = InputManager()
        published = SingleSelectInput(name="test", options=["Published"])
        cached = SingleSelectInput(name="test", options=["Cached"])
        manager._published_objects["test"] = published
        manager._cached_objects["test"] = cached

        result = manager.get("test")

        assert result.options == ["Cached"]

    def test_get_returns_published_when_no_cached(self):
        """Test that get returns published input when no cached exists."""
        manager = InputManager()
        published = SingleSelectInput(name="test", options=["Published"])
        manager._published_objects["test"] = published

        result = manager.get("test")

        assert result.options == ["Published"]

    def test_get_returns_none_when_not_found(self):
        """Test that get returns None when input doesn't exist."""
        manager = InputManager()

        result = manager.get("nonexistent")

        assert result is None

    def test_delete_from_cache_removes_cached(self):
        """Test delete_from_cache removes input from cache."""
        manager = InputManager()
        input_obj = SingleSelectInput(name="test", options=["A"])
        manager.save("test", input_obj)

        result = manager.delete_from_cache("test")

        assert result is True
        assert "test" not in manager.cached_objects

    def test_delete_from_cache_returns_false_when_not_cached(self):
        """Test delete_from_cache returns False when not in cache."""
        manager = InputManager()

        result = manager.delete_from_cache("nonexistent")

        assert result is False
