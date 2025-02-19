import os
import pytest
import yaml
import click
from unittest.mock import patch, MagicMock
from visivo.commands.parse_project_phase import parse_project_phase
from visivo.models.project import Defaults
from tests.factories.model_factories import ProjectFactory, DbtFactory
from tests.support.utils import temp_folder, temp_yml_file
from visivo.parsers.file_names import PROJECT_FILE_NAME
import json

@pytest.fixture
def output_dir():
    return temp_folder()

@pytest.fixture
def working_dir():
    return temp_folder()

@pytest.fixture
def basic_project():
    # Create a project with default source
    project = ProjectFactory()
    # The factory creates a default source named "source"
    project.defaults = Defaults(source_name="source")
    return project

@pytest.fixture
def dbt_project():
    # Create a project with default source and dbt config
    project = ProjectFactory(dbt=DbtFactory())
    # The factory creates a default source named "source"
    project.defaults = Defaults(source_name="source")
    return project

def setup_project_files(project, working_dir):
    """Helper function to set up project files in the working directory"""
    return temp_yml_file(
        dict=json.loads(project.model_dump_json()),
        name=PROJECT_FILE_NAME,
        output_dir=working_dir
    )

def test_parse_project_phase_without_dbt(basic_project, working_dir, output_dir):
    """Test parse_project_phase with a basic project without dbt configuration"""
    setup_project_files(basic_project, working_dir)
    
    # Mock dbt_phase since we don't want to actually run it
    with patch('visivo.commands.parse_project_phase.dbt_phase') as mock_dbt:
        project = parse_project_phase(
            working_dir=working_dir,
            output_dir=output_dir,
            default_source="source",
            dbt_profile=None,
            dbt_target=None
        )
        
        # Verify dbt_phase was called but didn't affect the result
        mock_dbt.assert_called_once()
        
        # Verify project was parsed correctly
        assert project is not None
        assert project.defaults.source_name == "source"
        assert os.path.exists(output_dir)
        assert os.path.exists(os.path.join(output_dir, "dashboards"))

def test_parse_project_phase_with_dbt(dbt_project, working_dir, output_dir):
    """Test parse_project_phase with a project that has dbt configuration"""
    setup_project_files(dbt_project, working_dir)
    
    # Mock dbt_phase to simulate successful dbt execution
    with patch('visivo.commands.parse_project_phase.dbt_phase') as mock_dbt:
        project = parse_project_phase(
            working_dir=working_dir,
            output_dir=output_dir,
            default_source="source",
            dbt_profile="test_profile",
            dbt_target="test_target"
        )
        
        # Verify dbt_phase was called with correct parameters
        mock_dbt.assert_called_once_with(
            working_dir,
            output_dir,
            "test_profile",
            "test_target"
        )
        
        # Verify project was parsed correctly
        assert project is not None
        assert project.defaults.source_name == "source"
        assert project.dbt is not None
        assert os.path.exists(output_dir)
        assert os.path.exists(os.path.join(output_dir, "dashboards"))

def test_parse_project_phase_with_invalid_yaml(working_dir, output_dir):
    """Test parse_project_phase with invalid YAML content"""
    # Create an invalid YAML file
    os.makedirs(working_dir, exist_ok=True)
    with open(os.path.join(working_dir, PROJECT_FILE_NAME), 'w') as f:
        f.write("invalid: yaml: content: [}")
    
    with pytest.raises(click.ClickException) as exc_info:
        parse_project_phase(
            working_dir=working_dir,
            output_dir=output_dir,
            default_source=None,
            dbt_profile=None,
            dbt_target=None
        )
    
    error_msg = str(exc_info.value)
    assert "Invalid yaml in project" in error_msg
    assert "Issue: mapping values are not allowed here" in error_msg

def test_parse_project_phase_with_missing_project_file(working_dir, output_dir):
    """Test parse_project_phase when project file is missing"""
    with pytest.raises(click.ClickException) as exc_info:
        parse_project_phase(
            working_dir=working_dir,
            output_dir=output_dir,
            default_source=None,
            dbt_profile=None,
            dbt_target=None
        )
    
    assert 'Project file "project.visivo.yml" not found' in str(exc_info.value)

def test_parse_project_phase_with_dbt_error(dbt_project, working_dir, output_dir):
    """Test parse_project_phase when dbt phase fails"""
    setup_project_files(dbt_project, working_dir)
    
    # Mock dbt_phase to simulate a failure
    with patch('visivo.commands.parse_project_phase.dbt_phase') as mock_dbt:
        mock_dbt.side_effect = click.ClickException("DBT Error")
        
        with pytest.raises(click.ClickException) as exc_info:
            parse_project_phase(
                working_dir=working_dir,
                output_dir=output_dir,
                default_source=None,
                dbt_profile="test_profile",
                dbt_target="test_target"
            )
        
        assert "DBT Error" in str(exc_info.value)

def test_parse_project_phase_with_stacktrace_logging(basic_project, working_dir, output_dir):
    """Test parse_project_phase with stacktrace logging enabled"""
    setup_project_files(basic_project, working_dir)
    
    # Enable stacktrace logging
    with patch.dict(os.environ, {'STACKTRACE': 'true'}):
        with patch('visivo.commands.parse_project_phase.Logger') as mock_logger:
            mock_logger_instance = MagicMock()
            mock_logger.instance.return_value = mock_logger_instance
            
            parse_project_phase(
                working_dir=working_dir,
                output_dir=output_dir,
                default_source=None,
                dbt_profile=None,
                dbt_target=None
            )
            
            # Verify debug and info logging calls
            mock_logger_instance.debug.assert_called_with("    Running dbt phase...")
            assert mock_logger_instance.info.call_count > 0
            assert "dbt phase completed in" in mock_logger_instance.info.call_args[0][0] 