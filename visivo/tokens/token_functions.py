import os
import yaml
import click
from visivo.logger.logger import Logger

PROFILE_PATH = os.path.expanduser("~/.visivo/profile.yml")


def _load_profile() -> dict:
    if not os.path.exists(PROFILE_PATH):
        return {}
    with open(PROFILE_PATH, "r") as f:
        return yaml.safe_load(f) or {}


def get_existing_token(host: str = None):
    """Return the token for ``host`` from ~/.visivo/profile.yml.

    The profile may be in either format:

      tokens:
        "https://app.visivo.io": abc123
        "http://localhost:3030": def456

    or the legacy single-token format:

      token: abc123

    Lookup order: ``tokens[host]`` → legacy ``token`` (only if ``host`` is
    None, so callers that *do* specify a host don't silently get the wrong
    one). Returns ``None`` if nothing matches.
    """
    profile = _load_profile()
    tokens = profile.get("tokens") or {}
    if host and host in tokens:
        return tokens[host]
    if host is None:
        if tokens:
            return next(iter(tokens.values()))
        return profile.get("token")
    return None


def write_token(token: str, host: str):
    """Write ``token`` under ``tokens[host]`` in the profile.

    Migrates a legacy single-token profile into the new map on first write.
    """
    if not host:
        raise click.ClickException("A host is required to store a token.")

    profile = _load_profile()
    tokens = dict(profile.get("tokens") or {})
    legacy_token = profile.get("token")
    if legacy_token and legacy_token not in tokens.values():
        tokens.setdefault("https://app.visivo.io", legacy_token)
    tokens[host] = token

    new_profile = {k: v for k, v in profile.items() if k != "token"}
    new_profile["tokens"] = tokens

    os.makedirs(os.path.dirname(PROFILE_PATH), exist_ok=True)
    try:
        with open(PROFILE_PATH, "w") as f:
            yaml.dump(new_profile, f)
        Logger.instance().success(f"Token written for {host}")
    except Exception as e:
        raise click.ClickException(f"Error writing token to {PROFILE_PATH}: {str(e)}")


def validate_and_store_token(token: str, host: str):
    """Prompt for a token if none provided, validate length, then write it under ``host``."""
    if token is None:
        token = click.prompt("Please enter your token")

    if len(token) < 10:
        raise click.ClickException(
            "Token is too short. Please ensure you have the correct token "
            "from the Visivo Settings Profile Page"
        )

    Logger.instance().debug("Token received")
    Logger.instance().debug(f"Writing token to {PROFILE_PATH} for host {host}")
    write_token(token, host)
    Logger.instance().debug("Token updated successfully")
