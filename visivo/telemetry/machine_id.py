"""
Machine ID management for telemetry.
"""

import os
import uuid
from pathlib import Path
from .config import is_ci_environment, is_telemetry_enabled


def get_machine_id() -> str:
    """
    Get or create a persistent anonymous machine ID.

    The machine ID is stored in ~/.visivo/machine_id and is created
    on first use. This provides anonymous user identification while
    preserving privacy.

    For CI/CD environments, generates a special prefixed ID that
    changes with each run to avoid persistence issues.

    Returns:
        str: A UUID string that uniquely identifies this installation
    """
    # Check if we're in CI/CD
    if is_ci_environment():
        # For CI, generate a new ID each time with a special prefix
        # This helps us identify CI runs and doesn't try to persist
        return f"ci-{uuid.uuid4()}"

    # Normal user environment - use persistent ID
    visivo_dir = Path.home() / ".visivo"
    machine_id_path = visivo_dir / "machine_id"

    # Try to read existing machine ID
    if machine_id_path.exists():
        try:
            with open(machine_id_path, "r") as f:
                machine_id = f.read().strip()
                # Validate it's a valid UUID (no prefix for regular users)
                if not machine_id.startswith("ci-"):
                    uuid.UUID(machine_id)
                    return machine_id
        except Exception:
            # If file is corrupted or invalid, regenerate
            pass

    # Generate new machine ID
    machine_id = str(uuid.uuid4())
    is_new_installation = True  # Flag to track this is a new installation

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

    # Send new installation event if telemetry is enabled
    # We do this after creating the machine ID to avoid circular imports
    if is_new_installation and is_telemetry_enabled():
        try:
            # Import here to avoid circular dependencies
            from .client import get_telemetry_client
            from .events import NewInstallationEvent

            client = get_telemetry_client(enabled=True)
            event = NewInstallationEvent.create(machine_id)
            client.track(event)
        except Exception:
            # Silently ignore telemetry errors
            pass

    return machine_id
