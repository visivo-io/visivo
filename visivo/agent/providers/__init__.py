"""Picking a provider, and finding its key.

Which one is config, not code: the loop imports `for_name` and never a module.
That is what makes VIS-1313 — if Visivo ever supplies inference — a change to
where the key comes from rather than a change to the loop.
"""

import os

from visivo.agent.providers import anthropic, gemini
from visivo.agent.providers.reply import Reply, ToolCall

PROVIDERS = {anthropic.NAME: anthropic, gemini.NAME: gemini}
DEFAULT_PROVIDER = anthropic.NAME

# Where a non-provider-standard key lives, so `visivo authorize`'s file can hold
# it beside the cloud tokens it already manages.
PROFILE_SECTION = "agent"


class ProviderError(Exception):
    """No usable provider — the wrong name, or no key. Carries what to do
    about it, because this is the error a first run hits."""


def for_name(name=None):
    resolved = (name or os.environ.get("VISIVO_AGENT_PROVIDER") or DEFAULT_PROVIDER).lower()
    if resolved not in PROVIDERS:
        known = ", ".join(sorted(PROVIDERS))
        raise ProviderError(f"Unknown agent provider '{resolved}'. Known providers: {known}.")
    return PROVIDERS[resolved]


def api_key(provider, profile=None):
    """The provider's own env var first, then the profile.

    Provider-standard names (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) mean anyone
    who already exports one for another tool needs no Visivo-specific setup —
    and a key in the environment beats a key on disk when they disagree,
    because the environment is the thing someone changed most recently.
    """
    from_env = os.environ.get(provider.API_KEY_ENV)
    if from_env:
        return from_env

    section = (profile or {}).get(PROFILE_SECTION) or {}
    from_profile = section.get("api_key")
    if from_profile:
        return from_profile

    raise ProviderError(
        f"No API key for {provider.NAME}. Set {provider.API_KEY_ENV}, or add "
        f"`{PROFILE_SECTION}: {{api_key: ...}}` to ~/.visivo/profile.yml."
    )


def model_for(provider, profile=None):
    section = (profile or {}).get(PROFILE_SECTION) or {}
    return os.environ.get("VISIVO_AGENT_MODEL") or section.get("model") or provider.DEFAULT_MODEL


__all__ = [
    "PROVIDERS",
    "DEFAULT_PROVIDER",
    "ProviderError",
    "Reply",
    "ToolCall",
    "for_name",
    "api_key",
    "model_for",
]
