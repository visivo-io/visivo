import threading
import time
from flask import Flask, request, jsonify
from threading import Event

from visivo.logging.logger import Logger
from visivo.tokens.token_functions import validate_and_store_token
from visivo.tokens.web_utils import generate_success_html_response

FLASK_PORT = 5001
token_received_event = Event()

callback_server = Flask(__name__)


def shutdown_server():
    time.sleep(1)
    shutdown = request.environ.get("werkzeug.server.shutdown")
    if shutdown:
        shutdown()


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
    debug=False, use_reloader=False to avoid double-start issues.
    """
    callback_server.config["BASE_URL"] = base_url
    callback_server.run(host="localhost", port=port, debug=False, use_reloader=False)
