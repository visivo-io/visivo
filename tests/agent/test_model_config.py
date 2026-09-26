"""Whose model, and whose money (VIS-1313).

The resolution ORDER is the design. Someone who exported a key meant it, and
should never silently find themselves spending Visivo's credits instead of
their own — nor the reverse, where a first run fails with instructions when a
Visivo login would have worked.
"""

import pytest

from visivo.agent import cloud_model
from visivo.agent.model_config import (
    SOURCE_BYO,
    SOURCE_CLOUD,
    AgentNotConfigured,
    resolve,
)

HOST = "https://app.visivo.io"


@pytest.fixture
def no_cloud(monkeypatch):
    monkeypatch.setattr(cloud_model, "token", lambda host=None: None)


@pytest.fixture
def with_cloud(monkeypatch):
    monkeypatch.setattr(cloud_model, "token", lambda host=None: "visivo-token")


class TestTheOrder:
    def test_an_exported_key_wins_over_a_visivo_login(self, with_cloud):
        """The one that must never regress. Quietly spending Visivo's credits
        when the user has paid for their own key is a billing surprise."""
        model, overlay, source = resolve(environ={"ANTHROPIC_API_KEY": "theirs"}, profile={})

        assert source == SOURCE_BYO
        assert model == "anthropic:claude-sonnet-4-5"
        assert overlay == {}

    def test_a_profile_key_also_wins(self, with_cloud):
        model, overlay, source = resolve(environ={}, profile={"agent": {"api_key": "from-file"}})

        assert source == SOURCE_BYO
        assert overlay == {"ANTHROPIC_API_KEY": "from-file"}

    def test_a_visivo_login_is_enough_on_its_own(self, with_cloud):
        """The whole point: `visivo authorize` and the agent works."""
        model, overlay, source = resolve(environ={}, profile={})

        assert source == SOURCE_CLOUD
        assert overlay == {}
        assert model.__class__.__name__ == "OpenAIChatModel"

    def test_nothing_at_all_explains_both_ways_out(self, no_cloud):
        with pytest.raises(AgentNotConfigured) as unconfigured:
            resolve(environ={}, profile={})

        message = str(unconfigured.value)
        assert "visivo authorize" in message
        assert "ANTHROPIC_API_KEY" in message


class TestAskingForSomethingSpecific:
    def test_an_explicit_model_is_never_answered_by_cloud(self, with_cloud):
        """Asking for Claude and silently getting Gemini would be a lie. If the
        user named a model, they get that model or an error."""
        with pytest.raises(AgentNotConfigured):
            resolve("anthropic:claude-opus-4-1", environ={}, profile={})

    def test_a_model_from_the_environment_counts_as_explicit(self, with_cloud):
        with pytest.raises(AgentNotConfigured):
            resolve(environ={"VISIVO_AGENT_MODEL": "anthropic:claude-opus-4-1"}, profile={})

    def test_an_explicit_model_with_its_own_key_is_fine(self, with_cloud):
        model, _, source = resolve(
            "anthropic:claude-opus-4-1", environ={"ANTHROPIC_API_KEY": "k"}, profile={}
        )

        assert (model, source) == ("anthropic:claude-opus-4-1", SOURCE_BYO)

    def test_a_self_credentialed_provider_needs_no_key_or_login(self, no_cloud):
        """Bedrock resolves through the AWS chain; demanding a key would break
        a setup that already works."""
        model, overlay, source = resolve("bedrock:anthropic.claude-v2", environ={}, profile={})

        assert (model, overlay, source) == ("bedrock:anthropic.claude-v2", {}, SOURCE_BYO)


class TestTheCloudModel:
    def test_it_points_at_core_not_at_a_provider(self, with_cloud):
        assert cloud_model.base_url(HOST) == f"{HOST}/api/inference/v1"

    def test_the_base_url_is_what_openai_appends_to(self, with_cloud):
        """pydantic-ai's OpenAIProvider appends `/chat/completions`, so this has
        to be the prefix core mounts that path under — off by one segment and
        every call 404s."""
        assert cloud_model.base_url(HOST).endswith("/api/inference/v1")

    def test_it_carries_the_visivo_token_as_its_key(self, with_cloud):
        model = cloud_model.build(HOST)

        assert model.client.api_key == "visivo-token"

    def test_no_token_means_not_available(self, no_cloud):
        assert cloud_model.available(HOST) is False
