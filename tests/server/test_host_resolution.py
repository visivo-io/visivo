"""One host per serve (VIS-1376).

"Which Visivo am I talking to" used to have three answers that could disagree:
`VISIVO_HOST` for tokens and deploys, `agent.host` for the agent, and a
`visivo authorize --host` whose default was a hardcoded production URL. So
`VISIVO_HOST=... visivo authorize` wrote a token for production and `visivo
serve` then could not find one — the two halves of one session on different
deployments, with nothing saying so.
"""

import pytest

from visivo.server.constants import DEFAULT_VISIVO_HOST, resolve_host


class TestResolutionOrder:
    def test_what_the_caller_was_told_wins(self, monkeypatch):
        monkeypatch.setenv("VISIVO_HOST", "https://from-env")

        assert resolve_host("https://from-flag") == "https://from-flag"

    def test_then_the_environment(self, monkeypatch):
        monkeypatch.setenv("VISIVO_HOST", "https://from-env")

        assert resolve_host() == "https://from-env"

    def test_then_the_default(self, monkeypatch):
        monkeypatch.delenv("VISIVO_HOST", raising=False)

        assert resolve_host() == DEFAULT_VISIVO_HOST

    def test_a_trailing_slash_is_not_part_of_the_host(self, monkeypatch):
        """Every caller concatenates a path onto this. A trailing slash makes
        every one of them ask for `//api/...`."""
        monkeypatch.delenv("VISIVO_HOST", raising=False)

        assert resolve_host("https://app.example/") == "https://app.example"


class TestTheAppCarriesIt:
    """Read from the app rather than the import-time constant, because a
    `--host` flag cannot change what an already-imported module saw."""

    def _app(self, **kwargs):
        from visivo.server.flask_app import FlaskApp
        from tests.factories.model_factories import ProjectFactory

        return FlaskApp(output_dir="target", project=ProjectFactory(), **kwargs)

    def test_the_flag_reaches_the_app(self, monkeypatch):
        monkeypatch.delenv("VISIVO_HOST", raising=False)

        assert self._app(host="https://app.development.visivo.io").host == (
            "https://app.development.visivo.io"
        )

    def test_without_one_it_resolves_the_same_way(self, monkeypatch):
        monkeypatch.setenv("VISIVO_HOST", "https://from-env")

        assert self._app().host == "https://from-env"

    def test_it_remembers_the_port_it_is_serving_on(self):
        """The device-authorize callback URL is built from it. Hardcoding 8000
        sent the token nowhere whenever someone served on another port."""
        assert self._app(port=8123).port == 8123
