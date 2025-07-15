"""
Event definitions and schemas for telemetry.
"""

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Literal, List
import platform
import sys
import uuid
from visivo.version import VISIVO_VERSION
from .config import is_ci_environment
from .machine_id import get_machine_id


# Generate a session ID that's unique per CLI/API session but not persistent
SESSION_ID = str(uuid.uuid4())

# Get the machine ID (will be created on first use)
MACHINE_ID = None  # Lazy load to avoid I/O during import


def _get_machine_id() -> str:
    """Get machine ID, caching the result."""
    global MACHINE_ID
    if MACHINE_ID is None:
        MACHINE_ID = get_machine_id()
    return MACHINE_ID


@dataclass
class BaseEvent:
    """Base class for all telemetry events."""

    event_type: str
    timestamp: str
    session_id: str
    machine_id: str
    properties: Dict[str, Any]

    def to_dict(self) -> Dict[str, Any]:
        """Convert event to dictionary for JSON serialization."""
        return asdict(self)


@dataclass
class CLIEvent(BaseEvent):
    """Event for CLI command execution."""

    @classmethod
    def create(
        cls,
        command: str,
        command_args: List[str],
        duration_ms: int,
        success: bool,
        error_type: Optional[str] = None,
        job_count: Optional[int] = None,
        object_counts: Optional[Dict[str, int]] = None,
        project_hash: Optional[str] = None,
    ) -> "CLIEvent":
        """Create a CLI event with common properties."""
        properties = {
            "command": command,
            "command_args": command_args,
            "duration_ms": duration_ms,
            "success": success,
            "visivo_version": VISIVO_VERSION,
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "platform": platform.system().lower(),
            "platform_version": platform.version(),
            "architecture": platform.machine(),
            "is_ci": is_ci_environment(),
        }

        if error_type:
            properties["error_type"] = error_type

        if job_count is not None:
            properties["job_count"] = job_count

        if object_counts:
            properties["object_counts"] = object_counts

        if project_hash:
            properties["project_hash"] = project_hash

        return cls(
            event_type="cli_command",
            timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            session_id=SESSION_ID,
            machine_id=_get_machine_id(),
            properties=properties,
        )


@dataclass
class APIEvent(BaseEvent):
    """Event for API request."""

    @classmethod
    def create(
        cls,
        endpoint: str,
        method: str,
        status_code: int,
        duration_ms: int,
        project_hash: Optional[str] = None,
    ) -> "APIEvent":
        """Create an API event with common properties."""
        properties = {
            "endpoint": endpoint,
            "method": method,
            "status_code": status_code,
            "duration_ms": duration_ms,
            "visivo_version": VISIVO_VERSION,
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "platform": platform.system().lower(),
            "platform_version": platform.version(),
            "architecture": platform.machine(),
            "is_ci": is_ci_environment(),
        }

        if project_hash:
            properties["project_hash"] = project_hash

        return cls(
            event_type="api_request",
            timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            session_id=SESSION_ID,
            machine_id=_get_machine_id(),
            properties=properties,
        )


@dataclass
class NewInstallationEvent(BaseEvent):
    """Event for when a new machine ID is created (new user/installation)."""

    @classmethod
    def create(cls, machine_id: str) -> "NewInstallationEvent":
        """Create a new installation event with system properties."""
        properties = {
            "visivo_version": VISIVO_VERSION,
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "platform": platform.system().lower(),
            "platform_version": platform.version(),
            "architecture": platform.machine(),
            "is_ci": is_ci_environment(),
        }

        return cls(
            event_type="new_installation",
            timestamp=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            session_id=SESSION_ID,
            machine_id=machine_id,  # Use the provided machine_id instead of calling _get_machine_id()
            properties=properties,
        )
