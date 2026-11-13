"""Project files (docs/contracts/project-files-and-credentials.md).

The listing works now; VIS-1762 implements uploads and imports.
"""

import os

from flask import jsonify, request

from visivo.server.project_files import (
    MAX_BYTES,
    InvalidExtension,
    list_project_files,
    parse_extensions,
)


def error(message, code, status):
    return jsonify({"error": message, "code": code}), status


def not_implemented(issue):
    return error(f"Not available yet ({issue}).", "not_implemented", 501)


def register_project_files_views(app, flask_app, output_dir):
    @app.route("/api/project-files/", methods=["GET"])
    def get_project_files():
        try:
            extensions = parse_extensions(request.args.get("ext"))
        except InvalidExtension as exc:
            return error(str(exc), "invalid_request", 400)
        root = flask_app._working_dir or os.getcwd()
        return jsonify(
            {
                "files": list_project_files(root, extensions),
                "formats": [],
                "max_bytes": MAX_BYTES,
            }
        )

    @app.route("/api/project-files/uploads/", methods=["POST"])
    def create_project_file_upload():
        return not_implemented("VIS-1762")

    @app.route("/api/project-files/uploads/<upload_id>/content/", methods=["PUT"])
    def put_project_file_upload_content(upload_id):
        return not_implemented("VIS-1762")

    @app.route("/api/project-files/uploads/<upload_id>/complete/", methods=["POST"])
    def complete_project_file_upload(upload_id):
        return not_implemented("VIS-1762")
