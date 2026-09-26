"""The model Visivo supplies (VIS-1313).

Logging in with ``visivo authorize`` should be enough to use the agent. That
works by pointing pydantic-ai's OpenAI-compatible client at core rather than at
a provider: core authenticates the same token the CLI already holds, calls
Gemini Enterprise Agent Platform with its own credentials, and meters what it
costs.

Nothing about the loop changes. It is handed a model, and this is one.
"""

from visivo.server.constants import VISIVO_HOST
from visivo.tokens.token_functions import get_existing_token

# pydantic-ai's OpenAIProvider appends `/chat/completions` to its base_url, so
# this is the prefix core mounts that path under.
INFERENCE_PATH = "/api/inference/v1"

# The name is core's to honour — it pins the model server-side so a client
# cannot choose its own cost — but a model name is required to construct the
# client, and this is the one core is configured with.
CLOUD_MODEL_NAME = "google/gemini-2.5-pro"


def token(host=None):
    return get_existing_token(host=host or VISIVO_HOST)


def available(host=None):
    return bool(token(host))


def base_url(host=None):
    return f"{host or VISIVO_HOST}{INFERENCE_PATH}"


def build(host=None, model_name=CLOUD_MODEL_NAME):
    """A pydantic-ai model that talks to core.

    Imported lazily: the OpenAI client is only needed on the cloud path, and a
    BYO-key run should not pay to import it.
    """
    from pydantic_ai.models.openai import OpenAIChatModel
    from pydantic_ai.providers.openai import OpenAIProvider

    return OpenAIChatModel(
        model_name,
        provider=OpenAIProvider(base_url=base_url(host), api_key=token(host)),
    )
