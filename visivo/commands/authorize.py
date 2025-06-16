import os
import platform
import click
from threading import Thread
from visivo.logger.logger import Logger
import urllib.parse
from visivo.commands.options import host
from visivo.tokens.token_functions import (
    get_existing_token,
)
from visivo.tokens.web_utils import open_url
from visivo.tokens.server import (
    run_flask_server,
    token_received_event,
    FLASK_PORT,
)

PROFILE_PATH = os.path.expanduser("~/.visivo/profile.yml")
CALLBACK_RESPONSE_WAIT_TIME = 120


@click.command()
@host
def authorize(host):
    """
    Handles the authorization process.

    Checks for an existing token, and if the user chooses to add a
    new token, starts a Flask server (listening for a callback on
    http://localhost:5001/authorize-device-token). It then opens an external webapp
    (at <host>/authorize-device) for testing. The external webapp should eventually
    send a callback to our Flask server.

    The process will wait for up to CALLBACK_RESPONSE_WAIT_TIME seconds for the callback.
    If the callback is not received, you will be prompted to cancel or continue waiting.
    """
    Logger.instance().spinner.stop()

    existing_token = get_existing_token()
    if existing_token:
        Logger.instance().info(f"A token already exists in your profile: {existing_token}")
        if not click.confirm("Do you want to add a new token?"):
            Logger.instance().info("Authorization cancelled. Using the existing token.")
            return

    server_thread = Thread(
        target=run_flask_server,
        kwargs={"port": FLASK_PORT, "base_url": host},
        daemon=True,
    )
    server_thread.start()

    device_name = platform.node()
    redirect_url = f"http://localhost:{FLASK_PORT}/authorize-device-token"

    params = {"redirect_url": redirect_url, "name": device_name}

    query_string = urllib.parse.urlencode(params)

    full_url = f"{host}/authorize-device?{query_string}"

    Logger.instance().info(f"Attempting to open URL: {full_url}")
    webbrowser_opened = open_url(full_url)

    if not webbrowser_opened:
        Logger.instance().error(
            "We couldn't automatically open the external web app. "
            "If you have multiple browser windows open, please copy the URL below and paste it "
            "into the address bar of the browser window where you're logged into Visivo."
        )
        Logger.instance().info(full_url)

    Logger.instance().info("Waiting for visivo token response (timeout: 120s)...")
    Logger.instance().info(
        "Please copy and paste the above URL into your logged in visivo browser window if this did not open automatically or if it opened a not authenticated browser."
    )

    try:
        if not token_received_event.wait(CALLBACK_RESPONSE_WAIT_TIME):
            Logger.instance().error("Timeout reached while waiting for callback.")
            if click.confirm("Do you want to cancel the authorization process?"):
                Logger.instance().info(
                    "Authorization cancelled. No token received. To add a token, try running the 'visivo authorize' command again"
                )
                return
            else:
                Logger.instance().info("Continuing to wait for token. Press Ctrl+C to cancel.")
                token_received_event.wait()  # Wait indefinitely.
    except KeyboardInterrupt:
        Logger.instance().info("Authorization process cancelled by user.")
        return
