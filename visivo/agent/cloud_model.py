"""The model Visivo supplies (VIS-1313).

Logging in with ``visivo authorize`` should be enough to use the agent. That
works by pointing pydantic-ai's OpenAI-compatible client at core rather than at
a provider: core authenticates the same token the CLI already holds, calls
Gemini Enterprise Agent Platform with its own credentials, and meters what it
costs.

Nothing about the loop changes. It is handed a model, and this is one.

## Visivo runs without Visivo Cloud

This is the open-source CLI, and the agent has to work for someone who has
never heard of our hosted product. So holding a token is NOT enough to use
this path — a token is what `visivo authorize` writes for deploys, and most
people who deploy have one whether or not their account serves inference.

Availability is asked, not assumed. If the host does not answer, or answers
that inference is off, we behave exactly as if there were no cloud at all:
the caller falls back to a BYO key and the plain instructions for setting one.
Getting this wrong means a 404 buried inside an OpenAI client error, in place
of the one message that would have helped.
"""

import requests

from visivo.logger.logger import Logger
from visivo.server.constants import VISIVO_HOST
from visivo.tokens.token_functions import get_existing_token

# pydantic-ai's OpenAIProvider appends `/chat/completions` to its base_url, so
# this is the prefix core mounts that path under. No version segment: there is
# one client and one server, both ours, released together — a version in the
# path would be ceremony for a compatibility promise nobody is making.
INFERENCE_PATH = "/api/inference"

# The name is core's to honour — it pins the model server-side so a client
# cannot choose its own cost — but a model name is required to construct the
# client, and this is the one core is configured with.
CLOUD_MODEL_NAME = "google/gemini-2.5-pro"


# Asked once per process. The answer changes when a deployment is
# reconfigured, which is not something a running `visivo serve` needs to track.
_capability = {}

# Short: this sits between the user pressing Send and anything happening, and a
# host that is slow to say "no" should not be what they wait for.
CAPABILITY_TIMEOUT_SECONDS = 3


def token(host=None):
    return get_existing_token(host=host or VISIVO_HOST)


def capability_url(host=None):
    return f"{host or VISIVO_HOST}/api/inference/"


def serves_inference(host=None):
    """Does this deployment offer inference at all?

    Any failure is a no. An older Visivo Cloud 404s here, a self-hosted one may
    not run the app, and a network that cannot reach it is indistinguishable
    from either — in every case the right answer is to use a local key.
    """
    host = host or VISIVO_HOST
    if host in _capability:
        return _capability[host]

    answer = False
    try:
        response = requests.get(capability_url(host), timeout=CAPABILITY_TIMEOUT_SECONDS)
        answer = response.status_code == 200 and bool(response.json().get("enabled"))
    except Exception as error:
        Logger.instance().debug(f"No Visivo-supplied inference at {host}: {error}")

    _capability[host] = answer
    return answer


def forget(host=None):
    """Test seam, and an escape hatch if a deployment is reconfigured under a
    long-running serve."""
    _capability.pop(host or VISIVO_HOST, None) if host else _capability.clear()


def available(host=None):
    """A token AND somewhere that will honour it."""
    return bool(token(host)) and serves_inference(host)


def base_url(host=None):
    return f"{host or VISIVO_HOST}{INFERENCE_PATH}"


def build(host=None, model_name=CLOUD_MODEL_NAME):
    """A pydantic-ai model that talks to core.

    Imported lazily: the OpenAI client is only needed on the cloud path, and a
    BYO-key run should not pay to import it.
    """
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    where = base_url(host)
    model = OpenAIChatModel(
        model_name,
        provider=OpenAIProvider(base_url=where, api_key=token(host)),
    )
    # Recorded so a failure can say which deployment it was talking to.
    # `agent: host:` can point anywhere, and naming the DEFAULT host in an
    # error about a different one is worse than naming none.
    model._visivo_endpoint = where
    return model


def endpoint_of(model):
    """Where this model was pointed, or ``None`` if it is not one of ours."""
    return getattr(model, "_visivo_endpoint", None)


def explain(error, host=None, model=None):
    """A clearer message when the failure is OUR endpoint, or ``None``.

    A 404 from Visivo Cloud is not a provider problem, but it arrives looking
    exactly like one — "status_code: 404, model_name: google/gemini-2.5-pro" —
    which sends someone to Google's status page for a route on our own server.

    The capability probe cannot prevent this on its own: it asks
    ``/api/inference/`` and a deployment can answer that while serving the
    completions path at a different shape. So the two can disagree, and when
    they do the message should say which one is wrong.
    """
    status = getattr(error, "status_code", None)
    if status not in (404, 503):
        return None

    # The endpoint actually used, then an explicit host, then the default.
    # Guessing the default when `agent: host:` pointed somewhere else would
    # send someone to look at the wrong server.
    where = endpoint_of(model) or host or VISIVO_HOST
    if status == 404:
        return (
            f"Visivo-supplied inference is not available at {where} — the server "
            "did not recognise the request. It is likely older than this CLI. "
            "Update it, point `agent: host:` at one that is current, or set your "
            "own provider key."
        )
    return (
        f"Visivo-supplied inference is configured but not switched on at {where}. "
        "Set your own provider key to keep working in the meantime."
    )
