"""
Flask middleware for automatic API telemetry tracking.
"""

import time
from flask import Flask, request, g
from .client import get_telemetry_client
from .events import APIEvent
from .config import is_telemetry_enabled


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

    # Get the telemetry client
    client = get_telemetry_client(enabled=True)

    # Hash the project name if available
    project_hash = None
    if project and hasattr(project, "name"):
        from .utils import hash_project_name

        project_hash = hash_project_name(project.name)

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

        # Calculate duration
        duration_ms = int((time.time() - g.start_time) * 1000)

        # Create sanitized endpoint path (remove IDs and sensitive data)
        endpoint = request.endpoint or request.path
        if endpoint:
            # Replace common ID patterns with placeholders
            import re

            # UUID pattern
            endpoint = re.sub(
                r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
                "{id}",
                endpoint,
            )
            # Numeric IDs
            endpoint = re.sub(r"/\d+", "/{id}", endpoint)
            # Hash-like strings
            endpoint = re.sub(r"/[0-9a-fA-F]{32,}", "/{hash}", endpoint)

        # Track the event
        event = APIEvent.create(
            endpoint=endpoint,
            method=request.method,
            status_code=response.status_code,
            duration_ms=duration_ms,
            project_hash=project_hash,
        )

        client.track(event)

        return response

    @app.teardown_appcontext
    def teardown(error=None):
        """Ensure telemetry is flushed on app teardown."""
        # This is called when the app context tears down
        # We don't need to do anything here as our client handles this
        pass
