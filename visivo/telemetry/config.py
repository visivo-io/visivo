"""
Telemetry configuration and opt-out logic.
"""

import os
import uuid
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


def get_machine_id() -> str:
    """
    Get or create a persistent anonymous machine ID.

    The machine ID is stored in ~/.visivo/machine_id and is created
    on first use. This provides anonymous user identification while
    preserving privacy.

    Returns:
        str: A UUID string that uniquely identifies this installation
    """
    visivo_dir = Path.home() / ".visivo"
    machine_id_path = visivo_dir / "machine_id"

    # Try to read existing machine ID
    if machine_id_path.exists():
        try:
            with open(machine_id_path, "r") as f:
                machine_id = f.read().strip()
                # Validate it's a valid UUID
                uuid.UUID(machine_id)
                return machine_id
        except Exception:
            # If file is corrupted or invalid, regenerate
            pass

    # Generate new machine ID
    machine_id = str(uuid.uuid4())

    # Ensure directory exists
    try:
        visivo_dir.mkdir(exist_ok=True)

        # Write machine ID to file
        with open(machine_id_path, "w") as f:
            f.write(machine_id)

    except Exception:
        # If we can't write the file, just return the generated ID
        # It will be regenerated next time, but that's better than failing
        pass

    return machine_id
