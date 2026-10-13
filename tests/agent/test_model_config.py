"""Whose model, and whose money (VIS-1313).

The resolution ORDER is the design. Someone who exported a key meant it, and
should never silently find themselves spending Visivo's credits instead of
their own — nor the reverse, where a first run fails with instructions when a
Visivo login would have worked.
"""

import pytest


def unconfigured_from(resolver, **kwargs):
    with pytest.raises(AgentNotConfigured) as raised:
        resolver(environ={}, profile={}, **kwargs)
    return raised.value


from visivo.agent import cloud_model
from visivo.agent.model_config import (
    SOURCE_BYO,
    SOURCE_CLOUD,
    AgentNotConfigured,
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

    def test_nothing_at_all_still_names_the_key_as_a_way_out(self, no_cloud):
        """With no cloud inference on offer here, a login is not a way out —
        so this says the one thing that IS (VIS-1367)."""
        with pytest.raises(AgentNotConfigured) as unconfigured:
            resolve(environ={}, profile={})

        assert "ANTHROPIC_API_KEY" in str(unconfigured.value)


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

        message = str(unconfigured_from(resolve))
        assert "does not offer" in message
        # And NOT a login: they are already logged in, and authorizing again
        # would not conjure inference onto a deployment that has none.
        assert "visivo authorize" not in message

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
    """One host per serve (VIS-1376).

    There used to be an agent-only host — a profile key and an env var — so
    the agent could be pointed at development while deploys stayed on
    production. Two settings that could silently disagree about which
    deployment you were on, and about which token was the right one.
    """

    def test_the_host_it_is_given_is_the_host_it_asks(self, monkeypatch):
        """Naming a deployment must move BOTH the capability probe and the
        token lookup — asking one host and billing another would be a
        confusing way to fail."""
        asked = []
        monkeypatch.setattr(cloud_model, "token", lambda host=None: "t")
        monkeypatch.setattr(
            cloud_model, "serves_inference", lambda host=None: asked.append(host) or True
        )

        _, _, source = resolve(environ={}, profile={}, host="https://app.development.visivo.io")

        assert source == SOURCE_CLOUD
        assert asked == ["https://app.development.visivo.io"]

    def test_with_no_host_it_uses_the_process_default(self, monkeypatch):
        asked = []
        monkeypatch.setattr(cloud_model, "token", lambda host=None: "t")
        monkeypatch.setattr(
            cloud_model, "serves_inference", lambda host=None: asked.append(host) or True
        )

        resolve(environ={}, profile={})

        assert asked == ["https://app.visivo.io"]

    def test_the_profile_can_no_longer_name_its_own(self, monkeypatch):
        """An `agent: host:` left in someone's profile must be INERT rather
        than quietly still in charge — a setting that half-works is worse than
        one that is gone."""
        asked = []
        monkeypatch.setattr(cloud_model, "token", lambda host=None: "t")
        monkeypatch.setattr(
            cloud_model, "serves_inference", lambda host=None: asked.append(host) or True
        )

        resolve(environ={}, profile={"agent": {"host": "https://stale.example"}})

        assert asked == ["https://app.visivo.io"]


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


class TestWhenOurOwnEndpointFails:
    """A 404 from Visivo Cloud arrives looking exactly like a provider error —
    "status_code: 404, model_name: google/gemini-2.5-pro" — which sends someone
    to Google's status page for a route on our own server."""

    def _http_error(self, status):
        from pydantic_ai.exceptions import ModelHTTPError

        return ModelHTTPError(
            status_code=status,
            model_name="google/gemini-2.5-pro",
            body={"detail": "No API endpoint at /api/inference/chat/completions"},
        )

    def test_a_404_says_the_server_is_probably_old(self):
        message = cloud_model.explain(self._http_error(404), HOST)

        assert HOST in message
        assert "older than this CLI" in message
        assert "own provider key" in message, "always leave a way to keep working"

    def test_a_503_says_it_is_switched_off_rather_than_missing(self):
        """Different cause, different fix — not-deployed and not-enabled need
        different things done about them."""
        assert "not switched on" in cloud_model.explain(self._http_error(503), HOST)

    def test_it_names_the_host_the_agent_was_pointed_at(self):
        """`agent: host:` can point somewhere else entirely, and "not available"
        without saying where is unactionable."""
        message = cloud_model.explain(self._http_error(404), "https://app.development.visivo.io")

        assert "app.development.visivo.io" in message

    def test_a_real_provider_failure_is_left_alone(self):
        """A rate limit from Google IS the provider's, and rewriting it as our
        problem would be a lie in the other direction."""
        assert cloud_model.explain(self._http_error(429), HOST) is None

    def test_anything_that_is_not_an_http_error_is_left_alone(self):
        assert cloud_model.explain(RuntimeError("something else"), HOST) is None


class TestItNamesTheServerItActuallyUsed:
    """ "Not sure what host it is trying." `agent: host:` can point anywhere,
    so naming the DEFAULT host in an error about a different one is worse than
    naming none at all."""

    def _built_against(self, host, monkeypatch):
        monkeypatch.setattr(cloud_model, "token", lambda h=None: "tok")
        return cloud_model.build(host)

    def test_the_model_records_where_it_was_pointed(self, monkeypatch):
        model = self._built_against("https://app.development.visivo.io", monkeypatch)

        assert cloud_model.endpoint_of(model) == ("https://app.development.visivo.io/api/inference")

    def test_the_error_names_that_one_not_the_default(self, monkeypatch):
        from pydantic_ai.exceptions import ModelHTTPError

        model = self._built_against("https://app.development.visivo.io", monkeypatch)
        message = cloud_model.explain(
            ModelHTTPError(status_code=404, model_name="m", body={}), model=model
        )

        assert "app.development.visivo.io" in message
        assert "https://app.visivo.io/" not in message

    def test_a_model_that_is_not_ours_records_nothing(self):
        """A BYO-key run has no Visivo endpoint to report, and inventing one
        would point someone at a server that had nothing to do with it."""
        assert cloud_model.endpoint_of(object()) is None


class TestTheFirstThingAFirstRunIsTold:
    """The message a first run hits (VIS-1367).

    It used to lead with "Set ANTHROPIC_API_KEY", which is accurate and is the
    wrong first thing to say: it sends someone to go and acquire a provider
    account before they can see whether any of this is worth it, when there is
    credit sitting there waiting for them.

    Three states, because "not signed in", "asked for a particular model" and
    "this server serves no inference" have three different answers — and
    offering credit that a deployment does not give would be worse than the
    technical message it replaced.
    """

    @pytest.fixture
    def offered(self, monkeypatch):
        """Inference on offer here, nobody signed in."""
        monkeypatch.setattr(cloud_model, "token", lambda host=None: None)
        monkeypatch.setattr(cloud_model, "serves_inference", lambda host=None: True)
        monkeypatch.setattr(cloud_model, "free_credit", lambda host=None: "$30")

    def test_it_leads_with_the_one_command(self, offered):
        message = str(unconfigured_from(resolve))

        first_line = message.splitlines()[0]
        assert "visivo authorize" in first_line
        assert "ANTHROPIC_API_KEY" not in first_line

    def test_it_says_what_they_get_for_running_it(self, offered):
        assert "$30 of free credit" in str(unconfigured_from(resolve))

    def test_byo_is_there_but_second(self, offered):
        """A real and supported option — the one that keeps working when the
        credit runs out — but not the first sentence."""
        message = str(unconfigured_from(resolve))

        assert "ANTHROPIC_API_KEY" in message
        assert message.index("visivo authorize") < message.index("ANTHROPIC_API_KEY")

    def test_a_deployment_that_names_no_figure_promises_none(self, offered, monkeypatch):
        """Better to say nothing than to quote a number this deployment does
        not give."""
        monkeypatch.setattr(cloud_model, "free_credit", lambda host=None: None)

        message = str(unconfigured_from(resolve))

        assert "visivo authorize" in message
        assert "credit" not in message

    def test_asking_for_a_model_we_cannot_supply_is_not_answered_with_a_login(self, offered):
        """Visivo-supplied inference serves one model. Telling someone who
        asked for Claude to log in would be offering them Gemini without
        saying so."""
        message = str(unconfigured_from(lambda **kw: resolve(requested="anthropic:claude-x", **kw)))

        assert "anthropic:claude-x" in message
        assert not message.startswith("Run `visivo authorize`")
        assert "ANTHROPIC_API_KEY" in message


class TestTheCreditFigureComesFromTheDeployment:
    """A number compiled into a released CLI outlives whatever it was when that
    CLI shipped, and quoting a stale figure at someone about to sign up is
    worse than quoting none."""

    def test_it_is_read_from_the_capability_answer(self, monkeypatch):
        monkeypatch.setattr(
            cloud_model,
            "capability",
            lambda host=None: {"enabled": True, "free_credit_micros": 30_000_000},
        )

        assert cloud_model.free_credit() == "$30"

    def test_a_fractional_grant_is_not_rounded_away(self, monkeypatch):
        monkeypatch.setattr(
            cloud_model,
            "capability",
            lambda host=None: {"enabled": True, "free_credit_micros": 2_500_000},
        )

        assert cloud_model.free_credit() == "$2.50"

    def test_a_deployment_that_offers_none_says_none(self, monkeypatch):
        monkeypatch.setattr(
            cloud_model,
            "capability",
            lambda host=None: {"enabled": False, "free_credit_micros": None},
        )

        assert cloud_model.free_credit() is None

    def test_an_older_deployment_that_does_not_send_it_is_not_a_crash(self, monkeypatch):
        """The field is new. A server that predates it still answers
        `enabled`, and inference still works — only the figure is missing."""
        monkeypatch.setattr(cloud_model, "capability", lambda host=None: {"enabled": True})

        assert cloud_model.free_credit() is None
