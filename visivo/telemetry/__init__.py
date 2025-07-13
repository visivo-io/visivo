"""
Telemetry module for Visivo CLI and API usage tracking.

This module provides anonymous usage telemetry to help improve Visivo.
Telemetry can be disabled via:
- Environment variable: VISIVO_TELEMETRY_DISABLED=true
- Project config: telemetry_enabled: false in defaults
- Global config: ~/.visivo/config.yml with telemetry_enabled: false
"""

from .client import TelemetryClient, get_telemetry_client
from .config import is_telemetry_enabled
from .context import get_telemetry_context

__all__ = [
    "TelemetryClient",
    "get_telemetry_client",
    "is_telemetry_enabled",
    "get_telemetry_context",
]
