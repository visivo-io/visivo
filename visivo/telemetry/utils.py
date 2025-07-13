"""
Utility functions for telemetry.
"""

import hashlib
from typing import Optional


def hash_project_name(project_name: Optional[str]) -> Optional[str]:
    """
    Hash a project name for privacy-preserving analytics.

    Uses SHA-256 with a salt to create a consistent but irreversible
    hash of the project name. This allows tracking unique projects
    without exposing actual project names.

    Args:
        project_name: The project name to hash

    Returns:
        str: Hexadecimal hash of the project name, or None if no name provided
    """
    if not project_name:
        return None

    # Use a fixed salt to ensure consistent hashing across runs
    # This salt makes it harder to reverse-engineer project names
    salt = "visivo-telemetry-v1"

    # Create hash
    hash_input = f"{salt}:{project_name}".encode("utf-8")
    hash_value = hashlib.sha256(hash_input).hexdigest()

    # Return first 16 characters for brevity (still plenty of entropy)
    return hash_value[:16]
