import os
import platform
import subprocess
import webbrowser
import yaml
import click
from flask import Flask, request, jsonify
from threading import Thread, Event
from visivo.logging.logger import Logger, TypeEnum
import urllib.parse

# Global event to signal that a token has been received.
token_received_event = Event()

# Adjust this to match your deployment url.
BASE_URL = "https://visivo.io"
FLASK_PORT = 5001
PROFILE_PATH = os.path.expanduser("~/.visivo/profile.yml")
# TODO: make the endpoint correct for production


def get_existing_token():
    """
    Checks if a token already exists in the profile file.
    Returns the existing token (as a string) if found, otherwise None.
    """
    if not os.path.exists(PROFILE_PATH):
        return None
    with open(PROFILE_PATH, "r") as profile_file:
        profile_yaml = yaml.safe_load(profile_file) or {}
        return profile_yaml.get("token")


def write_token(token):
    """
    Writes the token to the profile file.
    Creates the containing directory if necessary.
    """
    profile_dir = os.path.dirname(PROFILE_PATH)
    os.makedirs(profile_dir, exist_ok=True)
    try:
        with open(PROFILE_PATH, "w") as f:
            yaml.dump({"token": token}, f)
        Logger.instance().success("Token written successfully")
    except Exception as e:
        raise click.ClickException(f"Error writing token to {PROFILE_PATH}: {str(e)}")


def process_authorize(token):
    """
    Handles the authorization logic.
    Prompts for a token if not provided, validates its length, and writes it.
    """
    if token is None:
        token = click.prompt("Please enter your token")

    if len(token) < 10:
        raise click.ClickException(
            "Token is too short. Please ensure you have the correct token from the Visio Settings Profile Page"
        )

    Logger.instance().debug("Token received")
    Logger.instance().debug(f"Writing token to {PROFILE_PATH}")
    write_token(token)
    Logger.instance().debug("Token updated successfully")


def open_url(url: str) -> bool:
    """
    Tries to open the given URL in the default web browser.
    Returns True if webbrowser.open() claims success
    """
    # Parse & re-encode the query portion
    parsed = urllib.parse.urlparse(url)
    query_dict = dict(urllib.parse.parse_qsl(parsed.query))
    encoded_query = urllib.parse.urlencode(query_dict)
    safe_url = urllib.parse.urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            encoded_query,
            parsed.fragment,
        )
    )

    return webbrowser.open(safe_url)


def generate_success_html_response(base_url, timeout=5):
    """
    This succes page will display for `timeout` seconds before redirecting
    to base_url + '/profile'.
    """
    redirect_url = f"{base_url}/profile"
    html_content = f"""
    <html>
      <head>
        <meta http-equiv="refresh" content="{timeout};url={redirect_url}" />
        <title>Authorization Successful</title>
        <style>
          body {{
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            font-family: Arial, sans-serif;
            background-color: #f0f0f0;
          }}
          h1 {{
            font-size: 3em;
            font-weight: bold;
            text-align: center;
            color: #333;
          }}
          p {{
            text-align: center;
            font-size: 1.2em;
            color: #666;
          }}
        </style>
      </head>
      <body>
        <div>
          <h1>A token has been written to your development machine to this file ~/.visivo/profile.yml </h1>
          <p>You'll now be redirected to your profile page with more instructions on
          how to create a new stage and project should this be necessary.</p>
        </div>
      </body>
    </html>
    """
    return html_content


app = Flask(__name__)


@app.route("/authorize-device-token", methods=["GET", "POST"])
def authorize_device():
    token = None
    if request.method == "GET":
        token = request.args.get("token")
    if not token:
        return jsonify({"error": "Token not provided"}), 400

    Logger.instance().success("Received token via callback" + token)
    process_authorize(token)

    token_received_event.set()

    html_content = generate_success_html_response(BASE_URL, timeout=5)
    shutdown = request.environ.get("werkzeug.server.shutdown")
    if shutdown:
        shutdown()
    return html_content, 200


def run_flask_server():
    """Runs the Flask server on localhost:FLASK_PORT."""
    app.run(host="localhost", port=FLASK_PORT, debug=False, use_reloader=False)


@click.command()
def authorize():
    """
    Handles the authorization process.

    Stops the spinner, checks for an existing token, and if the user chooses to add a
    new token, starts a Flask server (listening for a callback on
    http://localhost:5001/authorize-device-token). It then opens an external webapp
    (at http://localhost:3030/authorize-device) for testing. The external webapp should eventually
    send a callback to our Flask server.

    The process will wait for up to 120 seconds for the callback. If the
    callback is not received, you will be prompted to cancel or continue waiting.
    """

    Logger.instance().spinner.stop()

    # Check for an existing token before starting the authorization flow.
    existing_token = get_existing_token()
    if existing_token:
        Logger.instance().info(
            f"A token already exists in your profile: {existing_token}"
        )
        if not click.confirm("Do you want to add a new token?"):
            Logger.instance().info("Authorization cancelled. Using the existing token.")
            Logger.instance().spinner.start()
            return

    # Start the Flask server in a separate daemon thread.
    flask_thread = Thread(target=run_flask_server)
    flask_thread.daemon = True
    flask_thread.start()

    machine_name = platform.node()
    redirect_url = f"http://localhost:{FLASK_PORT}/authorize-device-token"

    params = {"redirect_url": redirect_url, "name": machine_name}

    encoded_query = urllib.parse.urlencode(params)

    full_url = f"{BASE_URL}/authorize-device?{encoded_query}"

    Logger.instance().debug("Attempting to open URL:", full_url)
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
        "Please copy and paste the above URL into your logged in visivo browser window if this did not open automatically or if it opened a not authenticated browser tab."
    )

    try:
        # Wait up to 120 seconds for the token to be received.
        if not token_received_event.wait(120):
            Logger.instance().error("Timeout reached while waiting for callback.")
            if click.confirm("Do you want to cancel the authorization process?"):
                Logger.instance().info(
                    "Authorization cancelled. No token received. To add a token, try running the 'visivo authorize' command again"
                )
                return
            else:
                Logger.instance().info(
                    "Continuing to wait for callback indefinitely. Press Ctrl+C to cancel."
                )
                token_received_event.wait()  # Wait indefinitely.
    except KeyboardInterrupt:
        Logger.instance().info("Authorization process cancelled by user.")
        return

    Logger.instance().spinner.start()
