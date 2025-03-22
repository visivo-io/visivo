import pytest
import yaml
import os
import json
from visivo.server.project_writer import ProjectNamedChildrenWriter
from tests.support.utils import temp_folder, temp_yml_file

@pytest.fixture
def sample_named_children():
    current_dir = os.path.dirname(__file__)
    # Build the full path to the JSON file
    file_path = os.path.join(current_dir, 'named_children.json')
    with open(file_path, 'r') as f:
        return json.load(f)

@pytest.fixture
def temp_project_dir():
    return temp_folder()

@pytest.fixture
def writer(sample_named_children, temp_project_dir):
    current_dir = os.path.dirname(__file__)
    # Build the full path to the JSON file
    file_path = os.path.join(current_dir, 'project.json')
    with open(file_path, 'r') as f:
        project_data = json.load(f)

    project_file = temp_yml_file(project_data, name="project.yml", output_dir=temp_project_dir)
    return ProjectNamedChildrenWriter(sample_named_children, project_file)

def test_initial_files_to_write_map(writer, sample_named_children):
    """Test that the initial files to write map is created correctly"""
    files_map = writer.files_to_write
    assert len(files_map) == 1
    
def test__reconstruct_named_child_config(writer, sample_named_children):
    """Test that the named child config is reconstructed correctly"""

    # Test replacing an inline defined named child with the original named child config
    named_child_config = writer.named_children["Double Simple Line"].get("config")
    reconstructed_config = writer.reconstruct_named_child_config(named_child_config)
    assert  reconstructed_config.get("model").get("name") is not None

    # Test a larger object that has both inline defined and reference values
    named_child_config = writer.named_children["Simple Dashboard"].get("config")
    reconstructed_config = writer.reconstruct_named_child_config(named_child_config)
    assert  "is_inline_defined" not in str(reconstructed_config)