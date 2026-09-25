"""Which model, and with which key.

pydantic-ai resolves a provider key from the provider's own environment
variable on its own, which covers anyone who already exports one. What it does
not know about is ``~/.visivo/profile.yml`` — the file ``visivo authorize``
already writes — so that fallback is the only part left to us.

A key is never read from project config. Project YAML can come from a repo the
user did not write, and a key resolved from it is a key an untrusted project
could aim at an endpoint of its own choosing.
"""

import os

import yaml

from visivo.commands.utils import get_profile_file

PROFILE_SECTION = "agent"
DEFAULT_MODEL = "anthropic:claude-sonnet-4-5"

# What pydantic-ai reads by itself, per provider prefix. Used only to decide
# whether the profile needs consulting at all.
PROVIDER_KEY_ENV = {
    "anthropic": ("ANTHROPIC_API_KEY",),
    "google": ("GOOGLE_API_KEY", "GEMINI_API_KEY"),
    "google-gla": ("GOOGLE_API_KEY", "GEMINI_API_KEY"),
    "openai": ("OPENAI_API_KEY",),
}


class AgentNotConfigured(Exception):
    """No model or no key. This is the error a first run hits, so it carries
    what to do about it rather than just what is missing."""


def read_profile(home_dir=None):
    path = get_profile_file(**({"home_dir": home_dir} if home_dir else {}))
    if not os.path.exists(path):
        return {}
    try:
        with open(path) as profile:
            return yaml.safe_load(profile) or {}
    except Exception:
        # A malformed profile is not worth failing the whole request over —
        # the key may well be in the environment.
        return {}


def _section(profile):
    return (profile or {}).get(PROFILE_SECTION) or {}


def resolve_model(requested=None, profile=None):
    """A model string pydantic-ai understands, e.g. ``anthropic:claude-...``."""
    section = _section(profile)
    model = requested or os.environ.get("VISIVO_AGENT_MODEL") or section.get("model")
    return model or DEFAULT_MODEL


def resolve(requested=None, profile=None, environ=None):
    """``(model, env_overlay)``.

    ``env_overlay`` is what must be present in the environment for pydantic-ai
    to find a key — empty when it already can. Returning an overlay rather than
    setting it here keeps the decision testable and the mutation at one call
    site.
    """
    environ = os.environ if environ is None else environ
    profile = read_profile() if profile is None else profile
    model = resolve_model(requested, profile)

    prefix = model.split(":", 1)[0] if ":" in model else ""
    variables = PROVIDER_KEY_ENV.get(prefix)
    if not variables:
        # An unknown or unlisted provider resolves its own credentials (Bedrock
        # via the AWS chain, Vertex via ADC). Nothing to overlay, and guessing
        # would break the ones that work without a key.
        return model, {}

    if any(environ.get(name) for name in variables):
        return model, {}

    from_profile = _section(profile).get("api_key")
    if from_profile:
        return model, {variables[0]: from_profile}

    raise AgentNotConfigured(
        f"No API key for '{prefix}'. Set {variables[0]}, or add "
        f"`{PROFILE_SECTION}:\n  api_key: ...` to {get_profile_file()}."
    )
