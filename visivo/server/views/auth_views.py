import platform

import urllib
from uuid import uuid4

from flask import jsonify, request

from visivo.logger.logger import Logger
from visivo.server.constants import VISIVO_HOST
from visivo.tokens.token_functions import get_existing_token, validate_and_store_token
from visivo.tokens.web_utils import generate_success_html_response
from visivo.server.store import background_jobs, background_jobs_lock

FLASK_DEFAULT_PORT = 8000


def register_auth_views(app, flask_app, output_dir):
    @app.route("/api/auth/status/", methods=["POST"])
    def authorize_status():
        existing_token = get_existing_token()
        if existing_token:
            return (
                jsonify(
                    {
                        "message": f"A token already exists in your profile: {existing_token}",
                        "token": existing_token,
                    }
                ),
                200,
            )

        return jsonify({"message": "UnAuthenticated user access"})

    @app.route("/api/auth/authorize-device-token/", methods=["POST"])
    def authorize_device_token():
        auth_id = str(uuid4())
        device_name = platform.node()
        redirect_url = f"http://localhost:{FLASK_DEFAULT_PORT}/api/auth/authorize-device-token/callback/{auth_id}/"

        params = {"redirect_url": redirect_url, "name": device_name}

        query_string = urllib.parse.urlencode(params)

        full_url = f"{VISIVO_HOST}/authorize-device?{query_string}"

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

        Logger.instance().success("Received token via callback: " + token)
        validate_and_store_token(token)

        html_content = generate_success_html_response(VISIVO_HOST, timeout=5, closePopUp=True)

        with background_jobs_lock:
            if auth_id in background_jobs:
                background_jobs[auth_id] = {"message": "Authenticated", "status": 200}

        return html_content, 200
