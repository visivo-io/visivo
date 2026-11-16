"""POST /api/secrets/: one value into the project's .env.

Contract: docs/contracts/project-files-and-credentials.md. Cloud serves the same
request from the account secret store.
"""

import os
import re

from flask import jsonify, request

from visivo.logger.logger import Logger
from visivo.query.patterns import ENV_VAR_NAME_PATTERN
from visivo.server.source_credentials import (
    ensure_env_gitignored,
    merge_env_file,
    read_env_file,
)


def _error(message, code, status):
    return jsonify({"error": message, "code": code}), status


def register_secrets_views(app, flask_app, output_dir):
    @app.route("/api/secrets/", methods=["POST"])
    def create_secret():
        body = request.get_json(silent=True)
        body = body if isinstance(body, dict) else {}
        key, value = body.get("key"), body.get("value")
        if not isinstance(key, str) or not re.fullmatch(ENV_VAR_NAME_PATTERN, key):
            return _error(
                "A secret's key must be an environment variable name.", "invalid_request", 400
            )
        if not isinstance(value, str) or not value:
            return _error("A secret needs a value.", "invalid_request", 400)

        project_dir = getattr(flask_app, "_working_dir", None) or "."
        if key in read_env_file(project_dir) or key in os.environ:
            return _error(f"'{key}' already exists.", "already_exists", 409)
        try:
            ensure_env_gitignored(project_dir)
            merge_env_file(project_dir, {key: value})
        except OSError as e:
            Logger.instance().error(f"Could not write the project's .env file: {e.strerror}")
            return _error(
                "Could not save the secret to the project's .env file.", "storage_failed", 500
            )
        os.environ[key] = value
        return jsonify({"key": key}), 201
