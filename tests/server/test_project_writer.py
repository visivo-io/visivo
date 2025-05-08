import pytest
import yaml
import os
import json
from visivo.server.project_writer import ProjectWriter, diff, apply_diff, SubDiff, DELETE
from tests.support.utils import temp_folder, temp_yml_file


@pytest.fixture
def sample_named_children():
    current_dir = os.path.dirname(__file__)
    # Build the full path to the JSON file
    file_path = os.path.join(current_dir, "named_children.json")
    with open(file_path, "r") as f:
        return json.load(f)


@pytest.fixture
def temp_project_dir():
    return temp_folder()


@pytest.fixture
def writer(sample_named_children, temp_project_dir):
    current_dir = os.path.dirname(__file__)
    # Build the full path to the JSON file
    file_path = os.path.join(current_dir, "project.json")
    with open(file_path, "r") as f:
        project_data = json.load(f)

    project_file = temp_yml_file(project_data, name="project.yml", output_dir=temp_project_dir)

    return ProjectWriter(sample_named_children)


# New fixtures for individual method tests
@pytest.fixture
def simple_project_file(temp_project_dir):
    """Create a simple project file for testing"""
    initial_content = {"components": [{"name": "Existing Component", "value": "original"}]}
    project_file = temp_yml_file(
        initial_content, name="simple_project.yml", output_dir=temp_project_dir
    )
    return str(project_file)


@pytest.fixture
def simple_writer(temp_project_dir, simple_project_file):
    """Create a ProjectWriter instance with minimal configuration"""
    named_children = {
        "Existing Component": {
            "status": "Modified",
            "file_path": simple_project_file,
            "config": {"name": "Existing Component", "value": "original"},
        }
    }
    return ProjectWriter(named_children)


@pytest.fixture
def nested_project_file(temp_project_dir):
    """Create a simple project file for testing"""
    initial_content = {
        "components": [
            {
                "name": "Existing Component",
                "value": "original",
                "sub_components": [{"name": "Sub Component", "value": "sub_original"}],
            }
        ]
    }
    project_file = temp_yml_file(
        initial_content, name="nested_components_project.yml", output_dir=temp_project_dir
    )
    return str(project_file)


@pytest.fixture
def nested_writer(temp_project_dir, nested_project_file):
    """Create a ProjectWriter instance with minimal configuration"""
    named_children = {
        "Existing Component": {
            "status": "Modified",
            "file_path": nested_project_file,
            "config": {"name": "Existing Component", "value": "original"},
        },
        "Sub Component": {
            "status": "Modified",
            "file_path": nested_project_file,
            "config": {"name": "Sub Component", "value": "sub_original"},
        },
    }
    return ProjectWriter(named_children)


def test_initial_files_to_write_map(writer, sample_named_children):
    """Test that the initial files to write map is created correctly"""
    files_map = writer.files_to_write
    assert len(files_map) == 1


def test__reconstruct_named_child_config(writer, sample_named_children):
    """Test that the named child config is reconstructed correctly"""

    # Test replacing an inline defined named child with the original named child config
    reconstructed_config = writer._get_named_child_config("Double Simple Line")
    assert reconstructed_config.get("model").get("name") is not None

    # Test a larger object that has both inline defined and reference values
    reconstructed_config = writer._get_named_child_config("Simple Dashboard")
    assert "is_inline_defined" not in str(reconstructed_config)


def test_diff_basic():
    """Test the diff function with basic dictionary changes"""
    old_dict = {"name": "test", "value": 1}
    new_dict = {"name": "test", "value": 2}

    result = diff(old_dict, new_dict)
    assert result == {"value": 2}


def test_diff_nested():
    """Test the diff function with nested dictionary changes"""
    old_dict = {"config": {"name": "test", "value": 1}}
    new_dict = {"config": {"name": "test", "value": 2}}

    result = diff(old_dict, new_dict)
    assert isinstance(result["config"], SubDiff)
    assert result["config"]["value"] == 2


def test_diff_list_changes():
    """Test the diff function with list changes"""
    old_dict = {"items": [1, 2, 3]}
    new_dict = {"items": [1, 2, 4]}

    result = diff(old_dict, new_dict)
    assert result["items"] == [1, 2, 4]


def test_diff_deletions():
    """Test the diff function with key deletions"""
    old_dict = {"name": "test", "value": 1}
    new_dict = {"name": "test"}

    result = diff(old_dict, new_dict)
    assert result["value"] is DELETE


def test_apply_diff_basic():
    """Test applying basic diffs to a dictionary"""
    target = {"name": "test", "value": 1}
    diff_changes = {"value": 2}

    apply_diff(target, diff_changes)
    assert target == {"name": "test", "value": 2}


def test_apply_diff_nested():
    """Test applying nested diffs to a dictionary"""
    target = {"config": {"name": "test", "value": 1}}
    diff_changes = {"config": SubDiff({"value": 2})}

    apply_diff(target, diff_changes)
    assert target["config"]["value"] == 2


def test_update_named_child(simple_writer, simple_project_file):
    """Test updating an existing named child"""
    # Add the component to be updated
    simple_writer.named_children["Existing Component"] = {
        "status": "Modified",
        "file_path": simple_project_file,
        "config": {"name": "Existing Component", "value": "updated"},
    }
    simple_writer._update("Existing Component")

    # Verify the update was applied
    updated_component = simple_writer.files_to_write[simple_project_file]["components"][0]
    assert updated_component["value"] == "updated"


def test_new_named_child(simple_writer, simple_project_file):
    """Test adding a new named child"""
    # Add new component configuration
    simple_writer.named_children["New Component"] = {
        "status": "New",
        "new_file_path": simple_project_file,
        "type_key": "components",
        "config": {"name": "New Component", "value": "new"},
    }

    simple_writer._new("New Component")

    # Verify the new component was added
    components = simple_writer.files_to_write[simple_project_file]["components"]
    assert len(components) == 2  # Original + new component
    assert any(c["name"] == "New Component" and c["value"] == "new" for c in components)


def test_delete_named_child(simple_writer, simple_project_file):
    """Test deleting a named child"""
    # Update the existing component to be deleted
    simple_writer.named_children["Existing Component"]["status"] = "Deleted"

    simple_writer._delete("Existing Component")

    # Verify the component was deleted
    components = simple_writer.files_to_write[simple_project_file]["components"]
    assert len(components) == 0


def test_delete_named_child_with_reference(simple_writer, simple_project_file):
    """Test deleting a named child with reference replacement"""
    # Update the existing component to be deleted
    simple_writer.named_children["Existing Component"]["status"] = "Deleted"

    simple_writer._delete("Existing Component", replace_with_reference=True)

    # Verify the component was replaced with a reference
    components = simple_writer.files_to_write[simple_project_file]["components"]
    assert len(components) == 1
    assert components[0] == "${ref(Existing Component)}"


def test_move_top_level_named_child(simple_writer, simple_project_file, temp_project_dir):
    """Test moving a named child"""
    new_file_path = os.path.join(temp_project_dir, "new_project.yml")

    # Set up the component to be moved
    simple_writer.named_children["Existing Component"].update(
        {
            "status": "Moved",
            "new_file_path": new_file_path,
            "type_key": "components",
            "is_inline_defined": False,
        }
    )

    # Initialize the new file in files_to_write
    simple_writer.files_to_write[new_file_path] = {"components": []}

    simple_writer._move("Existing Component")

    # Verify the component was moved
    old_components = simple_writer.files_to_write[simple_project_file]["components"]
    new_components = simple_writer.files_to_write[new_file_path]["components"]

    # Check that old location no longer has component
    assert len(old_components) == 0

    # Check that new location has actual component
    assert len(new_components) == 1
    assert new_components[0]["name"] == "Existing Component"
    assert new_components[0]["value"] == "original"


def test_move_nested_named_child(nested_writer, nested_project_file, temp_project_dir):
    """Test moving a named child"""
    new_file_path = os.path.join(temp_project_dir, "new_project.yml")

    # Set up the component to be moved
    nested_writer.named_children["Sub Component"].update(
        {
            "status": "Moved",
            "new_file_path": new_file_path,
            "type_key": "components",
            "is_inline_defined": True,
        }
    )

    # Initialize the new file in files_to_write
    nested_writer.files_to_write[new_file_path] = {"components": []}

    nested_writer._move("Sub Component")

    # Verify the component was moved
    old_components = nested_writer.files_to_write[nested_project_file]["components"]
    new_components = nested_writer.files_to_write[new_file_path]["components"]

    # Check that old location no longer has component
    assert len(old_components) == 1
    assert old_components[0]["sub_components"][0] == "${ref(Sub Component)}"

    # Check that new location has actual component
    assert len(new_components) == 1
    assert new_components[0]["name"] == "Sub Component"
    assert new_components[0]["value"] == "sub_original"


def test_update_file_contents(simple_writer, simple_project_file, temp_project_dir):
    """Test the update_file_contents method handles all operations correctly"""
    new_file_path = str(os.path.join(temp_project_dir, "new_project.yml"))

    # Set up multiple operations
    simple_writer.named_children.update(
        {
            "New Component": {
                "status": "New",
                "new_file_path": simple_project_file,
                "type_key": "components",
                "config": {"name": "New Component", "value": "new"},
            },
            "Modified Component": {
                "status": "Modified",
                "file_path": simple_project_file,
                "config": {"name": "Modified Component", "value": "modified"},
            },
            "Moved Component": {
                "status": "Moved",
                "file_path": simple_project_file,
                "new_file_path": new_file_path,
                "type_key": "components",
                "config": {"name": "Moved Component", "value": "moved"},
            },
        }
    )

    # Initialize the new file
    simple_writer.files_to_write[new_file_path] = {"components": []}

    simple_writer.update_file_contents()

    # Verify all operations were applied correctly
    assert len(simple_writer.files_to_write[simple_project_file]["components"]) > 0
    assert len(simple_writer.files_to_write[new_file_path]["components"]) > 0
