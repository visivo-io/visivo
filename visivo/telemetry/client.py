"""
Telemetry client using PostHog SDK.
"""

import posthog
from typing import Optional
from .config import TELEMETRY_ENDPOINT, POSTHOG_API_KEY, POSTHOG_HOST, is_telemetry_enabled
from .events import BaseEvent


class TelemetryClient:
    """
    Telemetry client wrapper around PostHog SDK.

    This client maintains the same interface as the previous implementation
    but delegates to PostHog for actual event tracking.
    """

    def __init__(self, enabled: bool = True):
        """
        Initialize the telemetry client.

        Args:
            enabled: Whether telemetry is enabled
        """
        self.enabled = enabled
        self._initialized = False

        if self.enabled:
            self._initialize_posthog()

    def _initialize_posthog(self):
        """Initialize PostHog with our settings."""
        if self._initialized:
            return

        # Initialize PostHog with configuration
        posthog.api_key = POSTHOG_API_KEY
        posthog.host = POSTHOG_HOST

        # Configure PostHog settings for privacy
        posthog.disabled = not self.enabled
        posthog.personal_api_key = None  # Don't use personal API keys

        # Set batch settings similar to our previous implementation
        posthog.on_error = None  # Silently ignore errors
        posthog.debug = False
        posthog.send = True

        self._initialized = True

    def track(self, event: BaseEvent):
        """
        Track an event using PostHog.

        Args:
            event: The event to track
        """
        if not self.enabled:
            return

        try:
            event_dict = event.to_dict()

            # PostHog expects a specific format
            # Don't pass timestamp as string - PostHog will add its own
            posthog.capture(
                distinct_id=event_dict.get("machine_id", "anonymous"),
                event=event_dict.get("event_type", "unknown"),
                properties={
                    **event_dict.get("properties", {}),
                    "session_id": event_dict.get("session_id"),
                    "timestamp": event_dict.get("timestamp"),
                    # Override IP to prevent PII collection
                    "$ip": "0.0.0.0",
                },
            )
        except Exception:
            # Silently ignore all telemetry errors
            pass

    def flush(self, timeout: float = 2.0):
        """
        Flush any pending events.

        Args:
            timeout: Maximum time to wait for flush to complete
        """
        if not self.enabled:
            return

        try:
            posthog.flush()
        except Exception:
            # Silently ignore flush errors
            pass

    def shutdown(self):
        """Shutdown the telemetry client and send any remaining events."""
        if not self.enabled:
            return

        try:
            # PostHog handles shutdown automatically
            posthog.shutdown()
        except Exception:
            # Silently ignore shutdown errors
            pass


# Global telemetry client instance (created on first use)
_global_client: Optional[TelemetryClient] = None


def get_telemetry_client(enabled: bool = True) -> TelemetryClient:
    """
    Get the global telemetry client instance.

    Args:
        enabled: Whether telemetry should be enabled

    Returns:
        The global telemetry client
    """
    global _global_client
    if _global_client is None:
        _global_client = TelemetryClient(enabled=enabled)
    return _global_client
