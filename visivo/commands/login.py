import click

from visivo.commands.options import host


@click.command()
@host
def login(host):
    """
    Guides the user to create or store the token in ~/.visivo/profile.yml.
    """
    from visivo.logging.logger import Logger

    Logger.instance().debug("Starting login process...")
    from visivo.commands.login_phase import login_phase

    login_phase(host)
    Logger.instance().success("Login process completed.")
