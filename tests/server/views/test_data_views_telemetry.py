"""Tests for the viewer telemetry injection in data_views.

Two things ride on serving index.html:

  VIS-843 — `visivo serve` must honor the CLI/local telemetry opt-out: when
  telemetry is disabled, the served page sets
  `window.__VISIVO_TELEMETRY_DISABLED=true` so the viewer's PostHog client
  never initializes, and when enabled that flag must be absent.

  Guided First Run W1 — serving the page is the first moment the product is
  in front of the user, so it is where the time-to-value ladder's step 1
  (`first_run_launched`) fires, once per machine. The journey is then injected
  as `window.__VISIVO_FIRST_RUN` so the viewer's marks (steps 2-6) carry the
  same journey_id and machine_id and the whole span is one subtraction.
"""

import json
import re
from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def isolated_first_run(tmp_path, monkeypatch):
    """Keep the journey ledger and PostHog out of the developer's machine.

    Without this, serving index.html in a test would write to the real
    ~/.visivo/first_run.json and send a real event.
    """
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setattr(
        "visivo.telemetry.client.get_telemetry_client",
        lambda enabled=True: _RecordingClient.instance,
    )
    _RecordingClient.instance = _RecordingClient()
    return _RecordingClient.instance


class _RecordingClient:
    instance = None

    def __init__(self):
        self.events = []

    def track(self, event):
        self.events.append(event)


def _get_index_html(integration_client):
    response = integration_client.get("/")
    assert response.status_code == 200
    return response.get_data(as_text=True)


def _injected_journey(html):
    match = re.search(r"window\.__VISIVO_FIRST_RUN=(\{.*?\})</script>", html)
    assert match, f"no __VISIVO_FIRST_RUN in served html: {html[:400]}"
    return json.loads(match.group(1))


class TestViewerTelemetryInjection:
    def test_flag_injected_when_telemetry_disabled(self, integration_client):
        with patch(
            "visivo.server.views.data_views.is_telemetry_enabled",
            return_value=False,
        ):
            html = _get_index_html(integration_client)
        assert "window.__VISIVO_TELEMETRY_DISABLED=true" in html

    def test_flag_absent_when_telemetry_enabled(self, integration_client):
        with patch(
            "visivo.server.views.data_views.is_telemetry_enabled",
            return_value=True,
        ):
            html = _get_index_html(integration_client)
        assert "__VISIVO_TELEMETRY_DISABLED" not in html

    def test_env_opt_out_injects_flag(self, integration_client, monkeypatch):
        # Exercise the real is_telemetry_enabled path via the env opt-out.
        monkeypatch.setenv("VISIVO_TELEMETRY_DISABLED", "true")
        html = _get_index_html(integration_client)
        assert "window.__VISIVO_TELEMETRY_DISABLED=true" in html

    def test_default_serves_without_flag(self, integration_client, monkeypatch):
        # No opt-out env, no project/global config disable => enabled => no flag.
        monkeypatch.delenv("VISIVO_TELEMETRY_DISABLED", raising=False)
        with patch(
            "visivo.server.views.data_views.is_telemetry_enabled",
            return_value=True,
        ):
            html = _get_index_html(integration_client)
        assert "__VISIVO_TELEMETRY_DISABLED" not in html


class TestFirstRunJourneyInjection:
    """Guided First Run W1 — the CLI half of the time-to-value ladder."""

    def test_serving_the_viewer_marks_first_run_launched(
        self, integration_client, monkeypatch, isolated_first_run
    ):
        monkeypatch.delenv("VISIVO_TELEMETRY_DISABLED", raising=False)
        _get_index_html(integration_client)

        assert [event.event_type for event in isolated_first_run.events] == ["first_run_launched"]
        props = isolated_first_run.events[0].properties
        assert props["step_id"] == "first_run_launched"
        assert props["step_index"] == 1
        assert props["surface"] == "cli"

    def test_the_mark_fires_once_per_machine_not_once_per_page_load(
        self, integration_client, monkeypatch, isolated_first_run
    ):
        monkeypatch.delenv("VISIVO_TELEMETRY_DISABLED", raising=False)
        for _ in range(4):
            _get_index_html(integration_client)

        assert len(isolated_first_run.events) == 1

    def test_journey_is_injected_so_viewer_marks_join_the_cli_ones(
        self, integration_client, monkeypatch
    ):
        monkeypatch.delenv("VISIVO_TELEMETRY_DISABLED", raising=False)
        journey = _injected_journey(_get_index_html(integration_client))

        assert journey["journey_id"]
        assert isinstance(journey["started_at_ms"], int)
        assert journey["machine_id"]
        assert isinstance(journey["steps"]["first_run_launched"], int)

    def test_the_same_journey_is_injected_on_every_page_load(self, integration_client, monkeypatch):
        monkeypatch.delenv("VISIVO_TELEMETRY_DISABLED", raising=False)
        first = _injected_journey(_get_index_html(integration_client))
        second = _injected_journey(_get_index_html(integration_client))

        assert first["journey_id"] == second["journey_id"]
        assert first["started_at_ms"] == second["started_at_ms"]

    def test_opt_out_emits_nothing_and_injects_no_journey(
        self, integration_client, monkeypatch, isolated_first_run, tmp_path
    ):
        monkeypatch.setenv("VISIVO_TELEMETRY_DISABLED", "true")
        html = _get_index_html(integration_client)

        assert "__VISIVO_FIRST_RUN" not in html
        assert isolated_first_run.events == []
        # And no ledger file is left behind on an opted-out machine at all.
        assert not (tmp_path / ".visivo" / "first_run.json").exists()

    def test_injected_journey_cannot_break_out_of_the_script_tag(
        self, integration_client, monkeypatch
    ):
        monkeypatch.delenv("VISIVO_TELEMETRY_DISABLED", raising=False)
        html = _get_index_html(integration_client)

        # The journey is JSON built from UUIDs and integers, but the escaping
        # is what keeps it that way if a value ever changes shape.
        script = re.search(r"<script>window\.__VISIVO_FIRST_RUN=.*?</script>", html)
        assert script, "journey script tag missing"
        assert script.group(0).count("</script>") == 1
