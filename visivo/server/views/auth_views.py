import platform

import urllib
from uuid import uuid4

from flask import jsonify, request

from visivo.logger.logger import Logger
from visivo.tokens.token_functions import get_existing_token, validate_and_store_token
from visivo.tokens.web_utils import generate_success_html_response
from visivo.server.store import background_jobs, background_jobs_lock

# Where the device flow sends the token back, when serve could not say what
# port it is on. The old code hardcoded this into the callback URL, so serving
# on any other port sent the token to nothing.
FALLBACK_PORT = 8000


def register_auth_views(app, flask_app, output_dir):
    def _host():
        return flask_app.host

    @app.route("/api/auth/status/", methods=["GET", "POST"])
    def authorize_status():
        """Whether this serve holds a token for the host it is pointed at.

        The token itself is NOT returned. The page has no use for it, and a
        local server handing a cloud credential to a browser is a habit worth
        not having — this used to send it in the body and in a human-readable
        message beside it.

        POST is still accepted because the deploy modal asks that way; GET is
        the right shape for a question and is what new callers use.
        """
        host = _host()
        return jsonify({"authorized": bool(get_existing_token(host=host)), "host": host})

    @app.route("/api/auth/authorize-device-token/", methods=["POST"])
    def authorize_device_token():
        auth_id = str(uuid4())
        device_name = platform.node()
        port = getattr(flask_app, "port", None) or FALLBACK_PORT
        redirect_url = (
            f"http://localhost:{port}/api/auth/authorize-device-token/callback/{auth_id}/"
        )

        params = {"redirect_url": redirect_url, "name": device_name}

        query_string = urllib.parse.urlencode(params)

        full_url = f"{_host()}/authorize-device?{query_string}"

        with background_jobs_lock:
            background_jobs[auth_id] = {
                "status": 202,
                "message": "Autheticating ...",
            }

        return jsonify(
            {
                "message": "Authentication initiated successfully",
                "auth_id": auth_id,
                "full_url": full_url,
            }
        )

    @app.route("/api/auth/authorize-device-token/callback/<auth_id>/", methods=["GET", "POST"])
    def authorize_device_callback(auth_id):
        token = request.args.get("token") if request.method == "GET" else None
        if not token:
            with background_jobs_lock:
                if auth_id in background_jobs:
                    background_jobs[auth_id] = {"message": "UnAuthorized access", "status": 401}
            return jsonify({"error": "Token not provided"}), 400

        # The token itself is never logged. A terminal scrolls back, a log file
        # is read by whoever can read files, and this is a cloud credential
        # that outlives the session that printed it.
        Logger.instance().success("Received an authorization token.")
        validate_and_store_token(token, host=_host())

        html_content = generate_success_html_response(_host(), timeout=5, closePopUp=True)

        with background_jobs_lock:
            if auth_id in background_jobs:
                background_jobs[auth_id] = {"message": "Authenticated", "status": 200}

        return html_content, 200
