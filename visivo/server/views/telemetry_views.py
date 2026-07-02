"""
Telemetry forwarding endpoint for viewer Workspace events (VIS-822).

The viewer has no PostHog client of its own — `emitWorkspaceEvent` POSTs
workspace events here and the server forwards them through the shared
`visivo.telemetry` PostHog client. Routing frontend telemetry through the
server means the CLI's opt-out rules (`VISIVO_TELEMETRY_DISABLED`,
`~/.visivo/config.yml`, project `defaults.telemetry_enabled`) and its
anonymization (machine-id distinct ids, `$ip: 0.0.0.0`) apply to workspace
events identically to CLI/API events, and no analytics API key ships in the
JS bundle.

The dist/cloud viewer has no Flask server; its `urls.js` entry for this
endpoint is `null`, so the viewer-side sink is a no-op there.
"""

import json
import re

from flask import jsonify, request

from visivo.telemetry.config import is_telemetry_enabled
from visivo.telemetry.events import WorkspaceEvent

# Workspace event names are snake_case identifiers (see
# specs/dashboard-building/03-architecture-proposal.md §3.4).
EVENT_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,63}$")

# Canonical CLI/API event names are reserved: the relay is reachable by any LAN
# client, and `name` flows verbatim to `posthog.capture` via
# `WorkspaceEvent.create` (events.py). Rejecting these prevents a client from
# forging canonical telemetry. Taxonomy is additive-only — do NOT rename any of
# these; extend the blocklist instead if new reserved names are introduced.
RESERVED_EVENT_NAMES = frozenset({"cli_command", "api_request", "new_installation"})

# Workspace payloads are small property bags; anything larger is malformed
# (or abusive) input rather than a legitimate gesture event.
MAX_PAYLOAD_BYTES = 8192


def register_telemetry_views(app, flask_app, output_dir):
    """Register telemetry forwarding endpoints."""

    @app.route("/api/telemetry/workspace-event/", methods=["POST"])
    def post_workspace_event():
        """Forward a viewer workspace event through the server-side telemetry client."""
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return jsonify({"error": "Expected a JSON object body"}), 400

        name = body.get("name")
        if not isinstance(name, str) or not EVENT_NAME_PATTERN.match(name):
            return jsonify({"error": "Invalid event name"}), 400

        if name in RESERVED_EVENT_NAMES:
            return jsonify({"error": "Reserved event name"}), 400

        payload = body.get("payload", {})
        if payload is None:
            payload = {}
        if not isinstance(payload, dict):
            return jsonify({"error": "Event payload must be an object"}), 400

        try:
            payload_size = len(json.dumps(payload))
        except (TypeError, ValueError):
            return jsonify({"error": "Event payload must be JSON-serializable"}), 400
        if payload_size > MAX_PAYLOAD_BYTES:
            return jsonify({"error": "Event payload too large"}), 400

        # Respect the CLI opt-out — accept-and-drop so the viewer never has to
        # branch on whether telemetry is enabled.
        project = getattr(flask_app, "project", None)
        defaults = getattr(project, "defaults", None) if project is not None else None
        if not is_telemetry_enabled(defaults):
            return "", 204

        # Import here (not module level) so tests can patch the client factory
        # and so disabling telemetry never initializes the PostHog client.
        from visivo.telemetry.client import get_telemetry_client

        try:
            client = get_telemetry_client(enabled=True)
            client.track(WorkspaceEvent.create(name=name, properties=payload))
        except Exception:
            # Telemetry must never break the viewer — accept-and-drop.
            pass

        return "", 204
