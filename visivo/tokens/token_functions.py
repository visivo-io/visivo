import os
import yaml
import click
from visivo.logger.logger import Logger

PROFILE_PATH = os.path.expanduser("~/.visivo/profile.yml")


def get_existing_token():
    """Check if a token exists in the profile file."""
    if not os.path.exists(PROFILE_PATH):
        return None
    with open(PROFILE_PATH, "r") as profile_file:
        profile_yaml = yaml.safe_load(profile_file) or {}
        return profile_yaml.get("token")


def write_token(token):
    """Write the token to the profile file."""
    profile_dir = os.path.dirname(PROFILE_PATH)
    os.makedirs(profile_dir, exist_ok=True)
    try:
        with open(PROFILE_PATH, "w") as f:
            yaml.dump({"token": token}, f)
        Logger.instance().success("Token written successfully")
    except Exception as e:
        raise click.ClickException(f"Error writing token to {PROFILE_PATH}: {str(e)}")


def validate_and_store_token(token):
    """Prompt for a token if none provided, validate length, then write it."""
    if token is None:
        token = click.prompt("Please enter your token")

    if len(token) < 10:
        raise click.ClickException(
            "Token is too short. Please ensure you have the correct token "
            "from the Visio Settings Profile Page"
        )

    Logger.instance().debug("Token received")
    Logger.instance().debug(f"Writing token to {PROFILE_PATH}")
    write_token(token)
    Logger.instance().debug("Token updated successfully")
