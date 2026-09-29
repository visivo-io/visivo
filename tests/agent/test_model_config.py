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
    agent_host,
    resolve,
)

HOST = "https://app.visivo.io"


@pytest.fixture(autouse=True)
def no_capability_probe(monkeypatch):
    """Never let a test reach the network to ask whether inference exists."""
    monkeypatch.setattr(cloud_model, "serves_inference", lambda host=None: False)


@pytest.fixture
def no_cloud(monkeypatch):
    monkeypatch.setattr(cloud_model, "token", lambda host=None: None)


@pytest.fixture
def with_cloud(monkeypatch):
    """A token AND a deployment that serves inference. Both, because either
    alone is not enough — which is the point of the pair."""
    monkeypatch.setattr(cloud_model, "token", lambda host=None: "visivo-token")
    monkeypatch.setattr(cloud_model, "serves_inference", lambda host=None: True)


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


class TestVisivoRunsWithoutVisivoCloud:
    """This is the open-source CLI. Holding a token is not consent to depend on
    a hosted product being deployed — `visivo authorize` is what people run to
    DEPLOY, so most users have one whether or not inference exists for them."""

    def test_a_token_alone_is_not_enough(self, monkeypatch):
        monkeypatch.setattr(cloud_model, "token", lambda host=None: "visivo-token")
        monkeypatch.setattr(cloud_model, "serves_inference", lambda host=None: False)

        with pytest.raises(AgentNotConfigured):
            resolve(environ={}, profile={})

    def test_and_the_message_says_which_half_is_missing(self, monkeypatch):
        """Otherwise this is a 404 buried in an OpenAI client error, in place
        of the one instruction that would have helped."""
        monkeypatch.setattr(cloud_model, "token", lambda host=None: "visivo-token")
        monkeypatch.setattr(cloud_model, "serves_inference", lambda host=None: False)

        with pytest.raises(AgentNotConfigured) as unconfigured:
            resolve(environ={}, profile={})

        assert "not available at" in str(unconfigured.value)

    def test_an_unreachable_host_is_simply_not_available(self, monkeypatch):
        """A network that cannot reach us is indistinguishable from a
        deployment that does not serve inference, and the answer is the same."""
        import requests

        cloud_model.forget()
        monkeypatch.setattr(
            cloud_model.requests,
            "get",
            lambda *a, **k: (_ for _ in ()).throw(requests.ConnectionError("no route")),
        )

        assert cloud_model.serves_inference("https://nowhere.example") is False
        cloud_model.forget()


class TestChoosingADeployment:
    """Tokens are already per host, exactly as deploy tokens are, so pointing
    the agent at development is naming it — not re-authorising."""

    def test_the_profile_can_name_a_host(self):
        assert (
            agent_host(profile={"agent": {"host": "https://app.development.visivo.io"}}, environ={})
            == "https://app.development.visivo.io"
        )

    def test_the_environment_wins_over_the_profile(self):
        assert (
            agent_host(
                profile={"agent": {"host": "https://from-file"}},
                environ={"VISIVO_AGENT_HOST": "https://from-env"},
            )
            == "https://from-env"
        )

    def test_it_falls_back_to_the_default_host(self):
        assert agent_host(profile={}, environ={}) == "https://app.visivo.io"

    def test_the_chosen_host_is_the_one_asked_and_used(self, monkeypatch):
        """Naming a development deployment must move BOTH the capability probe
        and the token lookup — asking one host and billing another would be a
        confusing way to fail."""
        asked = []
        monkeypatch.setattr(cloud_model, "token", lambda host=None: "t")
        monkeypatch.setattr(
            cloud_model, "serves_inference", lambda host=None: asked.append(host) or True
        )

        _, _, source = resolve(
            environ={}, profile={"agent": {"host": "https://app.development.visivo.io"}}
        )

        assert source == SOURCE_CLOUD
        assert asked == ["https://app.development.visivo.io"]


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
        assert cloud_model.base_url(HOST) == f"{HOST}/api/inference"

    def test_the_base_url_is_what_openai_appends_to(self, with_cloud):
        """The SDK appends `/chat/completions`, so this has to be exactly the
        prefix core mounts that path under. Off by a segment and every call
        comes back as core's catch-all 404, which reads like the endpoint does
        not exist rather than like the base_url is wrong."""
        assert cloud_model.base_url(HOST) + "/chat/completions" == (
            f"{HOST}/api/inference/chat/completions"
        )

    def test_it_carries_the_visivo_token_as_its_key(self, with_cloud):
        model = cloud_model.build(HOST)

        assert model.client.api_key == "visivo-token"

    def test_no_token_means_not_available(self, no_cloud):
        assert cloud_model.available(HOST) is False
