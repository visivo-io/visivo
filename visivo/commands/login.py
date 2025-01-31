import os
import yaml
import click
from visivo.logging.logger import Logger


def login_phase(host, user_dir):
    """
    Handles the prompt logic and writes the token into ~/.visivo/profile.yml.
    """
    try:
        Logger.instance().success("Initialized")
        create_token = click.confirm(
            "Do you already have a Visivo token?", default=False
        )

        if not create_token:
            click.echo(f"\nVisit {host}/profile/settings to create your token.\n")
            return

        token = click.prompt("Please paste your Visivo token", type=str)

        visivo_dir = os.path.join(user_dir, ".visivo")
        profile_file = os.path.join(visivo_dir, "profile.yml")

        os.makedirs(visivo_dir, exist_ok=True)

        with open(profile_file, "w") as f:
            yaml.dump({"token": token}, f, default_flow_style=False)

        click.echo(f"\nToken saved successfully to {profile_file}.")

    except Exception as e:
        raise click.ClickException(f"Error during login process: {str(e)}")
