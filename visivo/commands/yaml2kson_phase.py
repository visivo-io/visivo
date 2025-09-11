import os
import shutil
from pathlib import Path
from typing import Any

import yaml

from visivo.discovery.discover import Discover
from visivo.logger.logger import Logger
from visivo.utils import get_output_dir


def yaml2kson_phase(project_dir: str, dry_run: bool, backup: bool):
    """
    Convert Visivo project YAML files to KSON format.
    
    Args:
        project_dir: The project directory path
        dry_run: If True, only show what would be converted
        backup: If True, create backup copies of original files
    """
    logger = Logger.instance()
    
    # Use Discover to find all project files including includes
    output_dir = get_output_dir(project_dir)
    discover = Discover(working_dir=project_dir, output_dir=output_dir)
    
    # Check if project file exists
    if not discover.project_file_exists:
        logger.error(f"No project.visivo.yml file found in {project_dir}")
        return
    
    try:
        # Get all project files including includes
        project_files = discover.files
    except Exception as e:
        logger.error(f"Error discovering project files: {e}")
        return
    
    if not project_files:
        logger.info("No YAML files found in the project")
        return
    
    # Filter to only YAML files (exclude profile files and other non-YAML)
    yaml_files = [f for f in project_files if f.suffix in ['.yml', '.yaml']]
    
    logger.info(f"Found {len(yaml_files)} YAML file(s) to convert")
    
    # Convert each file
    for yaml_file in yaml_files:
        convert_file(yaml_file, dry_run, backup)


def convert_file(yaml_file: Path, dry_run: bool, backup: bool):
    """
    Convert a single YAML file to KSON format.
    
    Args:
        yaml_file: Path to the YAML file
        dry_run: If True, only show what would be done
        backup: If True, create a backup of the original file
    """
    logger = Logger.instance()
    
    # Determine the new KSON filename
    kson_file = yaml_file.with_suffix('.kson')
    
    logger.info(f"Converting: {yaml_file} -> {kson_file}")
    
    if dry_run:
        return
    
    try:
        # Load YAML content
        with open(yaml_file, 'r') as f:
            yaml_content = yaml.safe_load(f)
        
        # Create backup if requested
        if backup:
            backup_file = yaml_file.with_suffix(yaml_file.suffix + '.bak')
            shutil.copy2(yaml_file, backup_file)
            logger.debug(f"Created backup: {backup_file}")
        
        # Convert to KSON
        kson_content = yaml_to_kson(yaml_content)
        
        # Write KSON file
        with open(kson_file, 'w') as f:
            f.write(kson_content)
        
        # Remove original YAML file
        yaml_file.unlink()
        
        logger.debug(f"Converted: {yaml_file.name}")
        
    except Exception as e:
        logger.error(f"Failed to convert {yaml_file}: {e}")


def yaml_to_kson(data: Any, indent: int = 0) -> str:
    """
    Convert Python data structure (from YAML) to KSON format.
    
    Args:
        data: The data structure to convert
        indent: Current indentation level
        
    Returns:
        KSON formatted string
    """
    indent_str = "  " * indent
    
    if data is None:
        return "null"
    elif isinstance(data, bool):
        return "true" if data else "false"
    elif isinstance(data, (int, float)):
        return str(data)
    elif isinstance(data, str):
        # Check if string needs quoting
        if needs_quoting(data):
            # Escape special characters and wrap in single quotes
            escaped = data.replace("'", "\\'")
            return f"'{escaped}'"
        else:
            return data
    elif isinstance(data, list):
        if not data:
            return "[]"
        
        # Check if it's a simple list that can be on one line
        if all(isinstance(item, (str, int, float, bool, type(None))) for item in data):
            simple_items = [yaml_to_kson(item) for item in data]
            # If short enough, put on one line
            if sum(len(item) for item in simple_items) < 60:
                return "[" + ", ".join(simple_items) + "]"
        
        # Multi-line list format
        lines = []
        for item in data:
            item_str = yaml_to_kson(item, indent + 1)
            lines.append(f"{indent_str}  - {item_str}")
        return "\n".join(lines)
    
    elif isinstance(data, dict):
        if not data:
            return "{}"
        
        lines = []
        for key, value in data.items():
            key_str = yaml_to_kson(key)
            
            if isinstance(value, (dict, list)) and value:
                # Multi-line value
                lines.append(f"{indent_str}{key_str}:")
                value_str = yaml_to_kson(value, indent + 1)
                if isinstance(value, list):
                    lines.append(value_str)
                else:
                    # For dicts, add each line with proper indentation
                    for line in value_str.split('\n'):
                        if line:
                            lines.append(f"{indent_str}  {line}")
            else:
                # Single-line value
                value_str = yaml_to_kson(value, indent + 1)
                lines.append(f"{indent_str}{key_str}: {value_str}")
        
        return "\n".join(lines)
    
    else:
        # Fallback to string representation
        return str(data)


def needs_quoting(s: str) -> bool:
    """
    Check if a string needs quoting in KSON format.
    
    Args:
        s: The string to check
        
    Returns:
        True if the string needs quoting
    """
    # Empty string needs quotes
    if not s:
        return True
    
    # Check for special characters that require quoting
    special_chars = [' ', ':', ',', '[', ']', '{', '}', '#', '@', '&', '*', '!', '|', '>', '<', '=', '%']
    
    # Check if string contains special characters
    if any(char in s for char in special_chars):
        return True
    
    # Check if string looks like a number
    try:
        float(s)
        return True
    except ValueError:
        pass
    
    # Check for special values
    if s.lower() in ['true', 'false', 'null', 'yes', 'no']:
        return True
    
    return False