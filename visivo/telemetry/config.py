"""
Telemetry configuration and opt-out logic.
"""

import os
from pathlib import Path
from typing import Optional
import yaml

# Default telemetry endpoint - this should be configured based on your backend
TELEMETRY_ENDPOINT = os.getenv("VISIVO_TELEMETRY_ENDPOINT", "https://telemetry.visivo.io/v1/events")
TELEMETRY_TIMEOUT = 1.0  # Maximum time to wait for telemetry requests


def _check_env_disabled() -> bool:
    """Check if telemetry is disabled via environment variable."""
    return os.getenv("VISIVO_TELEMETRY_DISABLED", "").lower() in ("true", "1", "yes")


def _check_global_config_disabled() -> bool:
    """Check if telemetry is disabled in global config file."""
    config_path = Path.home() / ".visivo" / "config.yml"
    if not config_path.exists():
        return False
    
    try:
        with open(config_path, "r") as f:
            config = yaml.safe_load(f) or {}
            return config.get("telemetry_enabled", True) is False
    except Exception:
        # If we can't read the config, assume telemetry is enabled
        return False


def is_telemetry_enabled(project_defaults: Optional[object] = None) -> bool:
    """
    Check if telemetry is enabled based on all configuration sources.
    
    Args:
        project_defaults: Optional Defaults object from the project
        
    Returns:
        bool: True if telemetry is enabled, False otherwise
    """
    # Check environment variable first (highest priority)
    if _check_env_disabled():
        return False
    
    # Check project defaults if provided
    if project_defaults and hasattr(project_defaults, "telemetry_enabled"):
        if project_defaults.telemetry_enabled is False:
            return False
    
    # Check global config file
    if _check_global_config_disabled():
        return False
    
    # Telemetry is enabled by default
    return True