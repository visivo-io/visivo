"""Tests for the viewer telemetry opt-out injection in data_views (VIS-843).

`visivo serve` must honor the CLI/local telemetry opt-out: when telemetry is
disabled, the served index.html sets `window.__VISIVO_TELEMETRY_DISABLED=true`
so the viewer's PostHog client never initializes. When telemetry is enabled,
that flag must be absent so the viewer's default-on telemetry runs. CI counts
as disabled: a browser driven against a pipeline's `visivo serve` is a test.
"""

import pytest
from unittest.mock import patch


def _get_index_html(integration_client):
    response = integration_client.get("/")
    assert response.status_code == 200
    return response.get_data(as_text=True)


@pytest.fixture
def not_ci():
    # pytest.ini sets CI=true; the CI gate is exercised by its own test below.
    with patch("visivo.server.views.data_views.is_ci_environment", return_value=False):
        yield


class TestViewerTelemetryInjection:
    def test_flag_injected_when_telemetry_disabled(self, integration_client, not_ci):
        with patch(
            "visivo.server.views.data_views.is_telemetry_enabled",
            return_value=False,
        ):
            html = _get_index_html(integration_client)
        assert "window.__VISIVO_TELEMETRY_DISABLED=true" in html

    def test_flag_absent_when_telemetry_enabled(self, integration_client, not_ci):
        with patch(
            "visivo.server.views.data_views.is_telemetry_enabled",
            return_value=True,
        ):
            html = _get_index_html(integration_client)
        assert "__VISIVO_TELEMETRY_DISABLED" not in html

    def test_env_opt_out_injects_flag(self, integration_client, monkeypatch, not_ci):
        # Exercise the real is_telemetry_enabled path via the env opt-out.
        monkeypatch.setenv("VISIVO_TELEMETRY_DISABLED", "true")
        html = _get_index_html(integration_client)
        assert "window.__VISIVO_TELEMETRY_DISABLED=true" in html

    def test_default_serves_without_flag(self, integration_client, monkeypatch, not_ci):
        # No opt-out env, no project/global config disable => enabled => no flag.
        monkeypatch.delenv("VISIVO_TELEMETRY_DISABLED", raising=False)
        with patch(
            "visivo.server.views.data_views.is_telemetry_enabled",
            return_value=True,
        ):
            html = _get_index_html(integration_client)
        assert "__VISIVO_TELEMETRY_DISABLED" not in html

    def test_ci_injects_flag_even_when_telemetry_enabled(self, integration_client):
        with (
            patch(
                "visivo.server.views.data_views.is_telemetry_enabled",
                return_value=True,
            ),
            patch(
                "visivo.server.views.data_views.is_ci_environment",
                return_value=True,
            ),
        ):
            html = _get_index_html(integration_client)
        assert "window.__VISIVO_TELEMETRY_DISABLED=true" in html
