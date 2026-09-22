import json
from unittest.mock import Mock, patch

import pytest
from flask import Flask

from visivo.telemetry import first_run
from visivo.server.views.telemetry_views import (
    MAX_PAYLOAD_BYTES,
    RESERVED_EVENT_NAMES,
    register_telemetry_views,
)


class TestTelemetryViews:
    """Test suite for the workspace-event telemetry forwarding endpoint (VIS-822)."""

    @pytest.fixture
    def flask_app(self):
        flask_app = Mock()
        flask_app.project = Mock()
        flask_app.project.defaults = None
        return flask_app

    @pytest.fixture
    def app(self, flask_app):
        app = Flask(__name__)
        app.config["TESTING"] = True
        register_telemetry_views(app, flask_app, "/tmp/output")
        return app

    @pytest.fixture
    def client(self, app):
        return app.test_client()

    def post_event(self, client, body):
        return client.post(
            "/api/telemetry/workspace-event/",
            data=json.dumps(body),
            content_type="application/json",
        )

    @patch("visivo.telemetry.client.get_telemetry_client")
    @patch("visivo.server.views.telemetry_views.is_telemetry_enabled", return_value=True)
    def test_forwards_event_through_telemetry_client(self, _enabled, get_client, client):
        telemetry_client = Mock()
        get_client.return_value = telemetry_client

        response = self.post_event(
            client,
            {"name": "workspace_mode_entered", "payload": {"dashboardName": "sales"}},
        )

        assert response.status_code == 204
        telemetry_client.track.assert_called_once()
        event = telemetry_client.track.call_args[0][0]
        assert event.event_type == "workspace_mode_entered"
        assert event.properties["dashboardName"] == "sales"
        assert event.properties["source_surface"] == "viewer_workspace"

    @patch("visivo.telemetry.client.get_telemetry_client")
    @patch("visivo.server.views.telemetry_views.is_telemetry_enabled", return_value=True)
    def test_payload_defaults_to_empty_object(self, _enabled, get_client, client):
        telemetry_client = Mock()
        get_client.return_value = telemetry_client

        response = self.post_event(client, {"name": "canvas_action"})

        assert response.status_code == 204
        event = telemetry_client.track.call_args[0][0]
        assert event.event_type == "canvas_action"

    @patch("visivo.telemetry.client.get_telemetry_client")
    @patch("visivo.server.views.telemetry_views.is_telemetry_enabled", return_value=False)
    def test_opt_out_accepts_and_drops_event(self, _enabled, get_client, client):
        response = self.post_event(
            client, {"name": "workspace_mode_entered", "payload": {"scope": "root"}}
        )

        assert response.status_code == 204
        get_client.assert_not_called()

    @patch("visivo.server.views.telemetry_views.is_telemetry_enabled", return_value=True)
    def test_opt_out_consults_project_defaults(self, enabled, client, flask_app):
        with patch("visivo.telemetry.client.get_telemetry_client") as get_client:
            get_client.return_value = Mock()
            self.post_event(client, {"name": "canvas_action"})
        enabled.assert_called_once_with(flask_app.project.defaults)

    def test_rejects_non_object_body(self, client):
        response = client.post(
            "/api/telemetry/workspace-event/",
            data=json.dumps(["not", "an", "object"]),
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_rejects_missing_name(self, client):
        response = self.post_event(client, {"payload": {}})
        assert response.status_code == 400

    @pytest.mark.parametrize(
        "bad_name",
        ["", "Has-Caps", "1starts_with_digit", "kebab-case", "a" * 65, 42],
    )
    def test_rejects_invalid_event_names(self, client, bad_name):
        response = self.post_event(client, {"name": bad_name})
        assert response.status_code == 400

    def test_rejects_non_object_payload(self, client):
        response = self.post_event(client, {"name": "canvas_action", "payload": [1, 2, 3]})
        assert response.status_code == 400

    def test_rejects_oversized_payload(self, client):
        response = self.post_event(
            client,
            {"name": "canvas_action", "payload": {"blob": "x" * (MAX_PAYLOAD_BYTES + 1)}},
        )
        assert response.status_code == 400

    @patch("visivo.telemetry.client.get_telemetry_client", side_effect=RuntimeError("boom"))
    @patch("visivo.server.views.telemetry_views.is_telemetry_enabled", return_value=True)
    def test_telemetry_client_errors_never_surface(self, _enabled, _get_client, client):
        response = self.post_event(client, {"name": "canvas_action", "payload": {}})
        assert response.status_code == 204

    @pytest.mark.parametrize("reserved", sorted(RESERVED_EVENT_NAMES))
    def test_rejects_reserved_cli_event_names(self, reserved, client):
        """The relay is reachable by any LAN client and `name` flows verbatim to
        posthog.capture — reserved CLI/API event names must be rejected so a
        client cannot forge canonical telemetry (finding #6). Before the fix
        these snake_case names passed validation and were forwarded."""
        response = self.post_event(client, {"name": reserved, "payload": {"forged": True}})
        assert response.status_code == 400

    def test_reserved_names_blocklist_is_the_canonical_set(self):
        """Guardrail: the blocklist must cover exactly the three canonical CLI/API
        event names (taxonomy is additive-only — do not rename these)."""
        assert RESERVED_EVENT_NAMES == {"cli_command", "api_request", "new_installation"}

    @patch("visivo.telemetry.client.get_telemetry_client")
    @patch("visivo.server.views.telemetry_views.is_telemetry_enabled", return_value=True)
    def test_reserved_names_never_reach_telemetry_client(self, _enabled, get_client, client):
        """A reserved name is rejected before any telemetry dispatch."""
        get_client.return_value = Mock()
        response = self.post_event(client, {"name": "cli_command"})
        assert response.status_code == 400
        get_client.assert_not_called()


class TestFirstRunStepWriteBack:
    """`/api/telemetry/first-run/step/` — the viewer's marks land in the ledger.

    `localStorage` is scoped to `http://localhost:<port>`; the ledger is not, so
    the write-back is what makes "once per journey" true off the origin the mark
    was made in.
    """

    @pytest.fixture(autouse=True)
    def isolated_home(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HOME", str(tmp_path))
        monkeypatch.delenv("VISIVO_TELEMETRY_DISABLED", raising=False)
        monkeypatch.setattr("visivo.telemetry.first_run._is_interactive_run", lambda: True)
        first_run.reset_journey_cache()
        yield tmp_path
        first_run.reset_journey_cache()

    @pytest.fixture
    def flask_app(self):
        flask_app = Mock()
        flask_app.project = Mock()
        flask_app.project.defaults = None
        return flask_app

    @pytest.fixture
    def client(self, flask_app):
        app = Flask(__name__)
        app.config["TESTING"] = True
        register_telemetry_views(app, flask_app, "/tmp/output")
        return app.test_client()

    def post_step(self, client, body):
        return client.post(
            "/api/telemetry/first-run/step/",
            data=json.dumps(body),
            content_type="application/json",
        )

    def test_a_recorded_mark_is_handed_back_to_the_next_page_load(self, client):
        journey = first_run.get_or_create_journey()

        response = self.post_step(
            client,
            {
                "step_id": "source_connected",
                "journey_id": journey["journey_id"],
                "at_ms": 1_700_000_000_000,
            },
        )

        assert response.status_code == 204
        # This is the dedupe: a browser that never saw the original mark is
        # seeded from here and refuses to fire it again.
        context = first_run.viewer_journey_context()
        assert context["steps"]["source_connected"] == 1_700_000_000_000

    @patch("visivo.telemetry.client.get_telemetry_client")
    def test_the_write_back_emits_nothing(self, get_client, client):
        telemetry_client = Mock()
        get_client.return_value = telemetry_client
        journey = first_run.get_or_create_journey()

        self.post_step(client, {"step_id": "source_connected", "journey_id": journey["journey_id"]})

        # The browser already sent this event; re-emitting it server-side would
        # double every viewer mark.
        telemetry_client.track.assert_not_called()

    def test_an_unknown_step_is_refused(self, client):
        first_run.get_or_create_journey()

        assert self.post_step(client, {"step_id": "definitely_not_a_step"}).status_code == 400
        assert first_run.read_ledger()["steps"] == {}

    def test_a_non_object_body_is_refused(self, client):
        response = client.post(
            "/api/telemetry/first-run/step/",
            data=json.dumps(["source_connected"]),
            content_type="application/json",
        )
        assert response.status_code == 400

    def test_a_mark_for_a_different_journey_is_dropped(self, client):
        first_run.get_or_create_journey()

        response = self.post_step(
            client, {"step_id": "source_connected", "journey_id": "some-other-journey"}
        )

        assert response.status_code == 204
        assert "source_connected" not in first_run.read_ledger()["steps"]

    def test_the_opt_out_covers_the_write_back(self, client, monkeypatch, isolated_home):
        monkeypatch.setenv("VISIVO_TELEMETRY_DISABLED", "true")

        assert self.post_step(client, {"step_id": "source_connected"}).status_code == 204
        assert not (isolated_home / ".visivo" / "first_run.json").exists()
