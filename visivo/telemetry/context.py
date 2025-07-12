"""
Telemetry context for sharing metrics across different parts of the application.
"""

from typing import Dict, Any, Optional
import threading


class TelemetryContext:
    """
    Thread-safe context for storing telemetry data that needs to be
    collected from different parts of the application.
    """

    def __init__(self):
        self._data: Dict[str, Any] = {}
        self._lock = threading.Lock()

    def set(self, key: str, value: Any):
        """Set a value in the context."""
        with self._lock:
            self._data[key] = value

    def get(self, key: str, default: Any = None) -> Any:
        """Get a value from the context."""
        with self._lock:
            return self._data.get(key, default)

    def update(self, data: Dict[str, Any]):
        """Update multiple values at once."""
        with self._lock:
            self._data.update(data)

    def get_all(self) -> Dict[str, Any]:
        """Get all context data."""
        with self._lock:
            return self._data.copy()

    def clear(self):
        """Clear all context data."""
        with self._lock:
            self._data.clear()


# Global telemetry context instance
_context = TelemetryContext()


def get_telemetry_context() -> TelemetryContext:
    """Get the global telemetry context."""
    return _context
