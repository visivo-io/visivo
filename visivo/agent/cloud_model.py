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

from visivo import cloud_api

from visivo.logger.logger import Logger
from visivo.server.constants import VISIVO_HOST
from visivo.tokens.token_functions import get_existing_token

# pydantic-ai's OpenAIProvider appends `/chat/completions` to this. Declared in
# `visivo.cloud_api` with every other route core exposes, so the CLI's
# dependency on core's surface can be read off one file.
INFERENCE_PATH = cloud_api.INFERENCE_PATH

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
    return f"{host or VISIVO_HOST}{cloud_api.CAPABILITY_PATH}"


def capability(host=None):
    """What this deployment offers: ``{"enabled": bool, "free_credit_micros": int|None}``.

    Any failure is "nothing". An older Visivo Cloud 404s here, a self-hosted
    one may not run the app, and a network that cannot reach it is
    indistinguishable from either — in every case the right answer is to use a
    local key.
    """
    host = host or VISIVO_HOST
    if host in _capability:
        return _capability[host]

    answer = {"enabled": False, "free_credit_micros": None}
    try:
        response = requests.get(capability_url(host), timeout=CAPABILITY_TIMEOUT_SECONDS)
        if response.status_code == 200:
            body = response.json()
            answer = {
                "enabled": bool(body.get("enabled")),
                "free_credit_micros": body.get("free_credit_micros"),
            }
    except Exception as error:
        Logger.instance().debug(f"No Visivo-supplied inference at {host}: {error}")

    _capability[host] = answer
    return answer


def serves_inference(host=None):
    return capability(host)["enabled"]


def free_credit(host=None):
    """What a new account is given here, as a display string, or ``None``.

    Read from the deployment rather than compiled in: a released CLI outlives
    whatever the figure was when it shipped, and quoting a stale number at
    someone about to sign up is worse than quoting none.
    """
    micros = capability(host).get("free_credit_micros")
    if not micros:
        return None
    dollars = int(micros) / 1_000_000
    return f"${dollars:,.0f}" if dollars == int(dollars) else f"${dollars:,.2f}"


def forget(host=None):
    """Test seam, and an escape hatch if a deployment is reconfigured under a
    long-running serve."""
    _capability.pop(host or VISIVO_HOST, None) if host else _capability.clear()


def available(host=None):
    """A token AND somewhere that will honour it."""
    return bool(token(host)) and serves_inference(host)


def base_url(host=None):
    return f"{host or VISIVO_HOST}{INFERENCE_PATH}"


OPENAI_FINISH_REASONS = {"stop", "length", "tool_calls", "content_filter", "function_call"}


def normalise_completion(payload):
    """A chat completion as the OpenAI schema allows it.

    Visivo Cloud relays another provider through an OpenAI-compatible surface,
    and that provider can answer with null token counts or a finish reason
    OpenAI does not define (`malformed_function_call`). pydantic-ai rejects
    either, which ended the user's turn on a raw validation error.
    """
    usage = payload.get("usage")
    if isinstance(usage, dict):
        for key in ("prompt_tokens", "completion_tokens", "total_tokens"):
            if usage.get(key) is None:
                usage[key] = 0
    for choice in payload.get("choices") or []:
        if choice.get("finish_reason") not in OPENAI_FINISH_REASONS:
            choice["finish_reason"] = "stop"
    return payload


def _cloud_chat_model_class():
    from pydantic_ai.models.openai import OpenAIChatModel, _ChatCompletion

    class CloudChatModel(OpenAIChatModel):
        def _validate_completion(self, response):
            return _ChatCompletion.model_validate(normalise_completion(response.model_dump()))

    return CloudChatModel


def build(host=None, model_name=CLOUD_MODEL_NAME):
    """A pydantic-ai model that talks to core.

    Imported lazily: the OpenAI client is only needed on the cloud path, and a
    BYO-key run should not pay to import it.
    """
    from pydantic_ai.providers.openai import OpenAIProvider

    where = base_url(host)
    model = _cloud_chat_model_class()(
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


# What core answers with when an account has nothing left to spend. The same
# word the tab already branches on when a turn is refused before it starts.
LIMIT_REACHED = "inference_limit_reached"


def _body(error):
    body = getattr(error, "body", None)
    if isinstance(body, dict):
        return body
    # The OpenAI SDK keeps only the "error" member of a JSON error body, so
    # core's "action" survives only on the response of the SDK error that
    # pydantic-ai raises from.
    response = getattr(getattr(error, "__cause__", None), "response", None)
    try:
        parsed = response.json()
    except Exception:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def limit_reached(error):
    """Whether this failure is a spend limit rather than something broken."""
    return getattr(error, "status_code", None) == 429 and _body(error).get("action") == (
        LIMIT_REACHED
    )


def explain(error, host=None, model=None):
    """A clearer message when the failure is OUR endpoint, or ``None``.

    A 404 from Visivo Cloud is not a provider problem, but it arrives looking
    exactly like one — "status_code: 404, model_name: google/gemini-2.5-pro" —
    which sends someone to Google's status page for a route on our own server.

    The capability probe cannot prevent this on its own: it asks
    ``/api/inference/`` and a deployment can answer that while serving the
    completions path at a different shape. So the two can disagree, and when
    they do the message should say which one is wrong.

    A spend limit is the same shape of problem. The limit IS enforced for a
    local `visivo serve` — core gates every call to the proxy, whoever is
    calling — but it arrived as "status_code: 429, model_name:
    google/gemini-2.5-pro, body: {'error': 'This account has used its $30 of
    free credit.', ...}". The sentence that helps was in there, buried in a
    dict repr beside a model name implying Google had rate-limited us.
    """
    status = getattr(error, "status_code", None)

    if limit_reached(error):
        # Core already phrased it — which limit, what it cost, when it resets.
        # Repeating that here would be a second copy to keep in step.
        return _body(error).get("error") or "This account has reached its spend limit."

    if status == 413:
        # nginx, not the model — the request never reached it. The body is an
        # HTML error page, and `model_name: google/gemini-2.5-pro` sits beside
        # it looking like Gemini said so.
        return (
            "This conversation has grown too large to send. Start a new one to "
            "carry on — the work so far is already saved as drafts."
        )

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
