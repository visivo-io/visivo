"""
Flask middleware for automatic API telemetry tracking.

Only ``/api/`` routes are tracked, and a burst of requests to one endpoint is
coalesced into one ``api_request`` event per window. Both rules exist because
the old "track every request" hook was the project's single largest PostHog
cost: viewer asset and ``/data/`` fetches, 2-second pollers and one runaway
client fetch loop (2.6M events from one machine in two days, Aug 2026) each
produced an event per request. Usage signal is kept — every endpoint still
appears, and ``request_count`` sums to the true total — only the volume is
bounded.
"""

import re
import threading
import time
from typing import Dict, Tuple

from flask import Flask, request, g
from .client import get_telemetry_client
from .events import APIEvent
from .config import is_telemetry_enabled, is_ci_environment

# Only requests under this prefix are tracked. Everything else the Flask app
# serves (the viewer bundle at ``/<path>``, project data at ``/data/``, the
# index page) is a static asset, not product usage.
TRACKED_PREFIX = "/api/"

# Routes under ``/api/`` that must never produce an ``api_request``: the
# workspace-event relay is itself telemetry (tracking it double-counts every
# viewer event), and health-style probes carry no signal.
UNTRACKED_PREFIXES = ("/api/telemetry/",)

# A burst to one (endpoint, method, status) is reported as one event per
# window; the rest are counted and ride on the next event as ``request_count``.
COALESCE_WINDOW_SECONDS = 60.0

_UUID_RE = re.compile(
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)
_NUMERIC_ID_RE = re.compile(r"/\d+")
_HASH_RE = re.compile(r"/[0-9a-fA-F]{32,}")


def sanitize_endpoint(endpoint: str) -> str:
    """Replace IDs embedded in a path-style endpoint with placeholders."""
    endpoint = _UUID_RE.sub("{id}", endpoint)
    endpoint = _NUMERIC_ID_RE.sub("/{id}", endpoint)
    endpoint = _HASH_RE.sub("/{hash}", endpoint)
    return endpoint


def is_tracked_path(path: str) -> bool:
    """True when a request path should produce an ``api_request`` event."""
    if not path or not path.startswith(TRACKED_PREFIX):
        return False
    return not path.startswith(UNTRACKED_PREFIXES)


class RequestCoalescer:
    """Per-process window counter keyed by (endpoint, method, status_code).

    ``admit`` returns the number of requests the caller should report now:
    ``0`` to stay silent (inside an open window), or ``1 + suppressed`` when a
    new window opens, where ``suppressed`` is how many requests were silenced
    in the previous window for that key. The trailing window of a process is
    lost at exit, which is an acceptable undercount for a usage signal.
    """

    def __init__(self, window_seconds: float = COALESCE_WINDOW_SECONDS, clock=time.monotonic):
        self._window = window_seconds
        self._clock = clock
        self._lock = threading.Lock()
        # key -> (window_start, suppressed_since_window_start)
        self._windows: Dict[Tuple[str, str, int], Tuple[float, int]] = {}

    def admit(self, key: Tuple[str, str, int]) -> int:
        now = self._clock()
        with self._lock:
            entry = self._windows.get(key)
            if entry is not None:
                window_start, suppressed = entry
                if now - window_start < self._window:
                    self._windows[key] = (window_start, suppressed + 1)
                    return 0
                self._windows[key] = (now, 0)
                return 1 + suppressed
            self._windows[key] = (now, 0)
            return 1


def init_telemetry_middleware(app: Flask, project=None):
    """
    Initialize telemetry middleware for a Flask app.

    Args:
        app: The Flask application
        project: Optional project object to check for telemetry settings
    """
    # Check if telemetry is enabled
    project_defaults = project.defaults if project else None
    telemetry_enabled = is_telemetry_enabled(project_defaults)

    if not telemetry_enabled:
        return

    # A `visivo serve` under CI is a smoke test, not a user session; its
    # requests are noise. (`cli_command` still reports from CI — a customer
    # running `visivo deploy` in their pipeline is a real adoption signal.)
    if is_ci_environment():
        return

    # Get the telemetry client
    client = get_telemetry_client(enabled=True)

    # Hash the project name if available
    project_hash = None
    if project and hasattr(project, "name"):
        from .utils import hash_project_name

        project_hash = hash_project_name(project.name)

    coalescer = RequestCoalescer()

    @app.before_request
    def before_request():
        """Record the start time of the request."""
        g.start_time = time.time()

    @app.after_request
    def after_request(response):
        """Track the API request after it completes."""
        # Skip if no start time (shouldn't happen)
        if not hasattr(g, "start_time"):
            return response

        if not is_tracked_path(request.path):
            return response

        # Calculate duration
        duration_ms = int((time.time() - g.start_time) * 1000)

        # Create sanitized endpoint path (remove IDs and sensitive data)
        endpoint = request.endpoint or request.path
        if endpoint:
            endpoint = sanitize_endpoint(endpoint)

        request_count = coalescer.admit((endpoint, request.method, response.status_code))
        if request_count == 0:
            return response

        # Track the event
        event = APIEvent.create(
            endpoint=endpoint,
            method=request.method,
            status_code=response.status_code,
            duration_ms=duration_ms,
            project_hash=project_hash,
            request_count=request_count,
        )

        client.track(event)

        return response
