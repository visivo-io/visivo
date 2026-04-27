import threading
import time
from flask import Flask, request, jsonify
from threading import Event
from werkzeug.serving import make_server

from visivo.logger.logger import Logger
from visivo.tokens.token_functions import validate_and_store_token
from visivo.tokens.web_utils import generate_success_html_response

FLASK_PORT = 5001
token_received_event = Event()

callback_server = Flask(__name__)

# Holds the live werkzeug server so the shutdown thread can stop it cleanly.
# Werkzeug 2.1 removed the `werkzeug.server.shutdown` environ hook, and `request`
# isn't bound outside a request context anyway, so we keep an explicit handle.
_server_holder: dict = {}


def shutdown_server():
    # Give the response a moment to flush before tearing the socket down.
    time.sleep(1)
    server = _server_holder.get("server")
    if server is not None:
        server.shutdown()


@callback_server.route("/authorize-device-token", methods=["GET", "POST"])
def authorize_device_callback():
    token = request.args.get("token") if request.method == "GET" else None
    if not token:
        return jsonify({"error": "Token not provided"}), 400

    Logger.instance().success("Received token via callback: " + token)
    validate_and_store_token(token)
    token_received_event.set()

    base_url = callback_server.config.get("BASE_URL")
    html_content = generate_success_html_response(base_url, timeout=5)

    threading.Thread(target=shutdown_server).start()
    return html_content, 200


def run_flask_server(base_url, port=5001):
    """
    Runs the Flask server on localhost:<port>.

    Uses werkzeug.serving.make_server directly so that shutdown_server()
    can call .shutdown() on the live server instance — the older
    `request.environ['werkzeug.server.shutdown']` pattern was removed in
    Werkzeug 2.1 and also can't be invoked from outside a request context.
    """
    callback_server.config["BASE_URL"] = base_url
    server = make_server("localhost", port, callback_server)
    _server_holder["server"] = server
    try:
        server.serve_forever()
    finally:
        _server_holder.pop("server", None)
