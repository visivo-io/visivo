"""Project files (docs/contracts/project-files-and-credentials.md)."""

import os

from flask import jsonify, request

from visivo.server.project_file_uploads import (
    FORMATS,
    ProjectFileStore,
    UploadError,
)
from visivo.server.project_files import (
    MAX_BYTES,
    InvalidExtension,
    list_project_files,
    parse_extensions,
)


def error(message, code, status):
    return jsonify({"error": message, "code": code}), status


def register_project_files_views(app, flask_app, output_dir):
    stores = {}

    def project_root():
        return os.path.realpath(flask_app._working_dir or os.getcwd())

    def store():
        root = project_root()
        if root not in stores:
            stores[root] = ProjectFileStore(root)
        return stores[root]

    @app.errorhandler(UploadError)
    def upload_error(exc):
        return error(exc.message, exc.code, exc.status)

    @app.route("/api/project-files/", methods=["GET"])
    def get_project_files():
        try:
            extensions = parse_extensions(request.args.get("ext"))
        except InvalidExtension as exc:
            return error(str(exc), "invalid_request", 400)
        files = []
        for entry in list_project_files(project_root(), extensions):
            files.append(store().version_at(entry["path"]) or entry)
        return jsonify({"files": files, "formats": FORMATS, "max_bytes": MAX_BYTES})

    @app.route("/api/project-files/uploads/", methods=["POST"])
    def create_project_file_upload():
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return error("Send the file's name and size.", "invalid_request", 400)
        upload = store().create(
            body.get("filename"),
            body.get("size"),
            content_type=body.get("content_type"),
            sha256=body.get("sha256"),
        )
        return jsonify(upload), 201

    @app.route("/api/project-files/uploads/<upload_id>/content/", methods=["PUT"])
    def put_project_file_upload_content(upload_id):
        if request.content_length is not None and request.content_length > MAX_BYTES:
            return error("The file is larger than 100 MB.", "too_large", 413)
        store().write_content(upload_id, request.stream)
        return "", 204

    @app.route("/api/project-files/uploads/<upload_id>/complete/", methods=["POST"])
    def complete_project_file_upload(upload_id):
        return jsonify({"file": store().complete(upload_id)})
