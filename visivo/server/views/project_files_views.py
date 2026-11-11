"""Project files and file imports (docs/contracts/project-files-and-credentials.md)."""

import os

from flask import jsonify, request

from visivo.server.managers.source_op_job_manager import SourceOpJobManager
from visivo.server.project_file_imports import (
    existing_import,
    preview_csv,
    reader_options,
    resolve_file,
    source_config,
)
from visivo.server.project_file_uploads import (
    FORMATS,
    ProjectFileStore,
    UploadError,
    format_for,
)
from visivo.server.project_files import (
    MAX_BYTES,
    InvalidExtension,
    file_entry,
    list_project_files,
    parse_extensions,
)

IMPORT_JOB_KINDS = {"file_inspect", "file_import"}


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

    @app.route("/api/project-file-imports/", methods=["POST"])
    def start_project_file_import():
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return error("Send the file's path and an action.", "invalid_request", 400)
        action = body.get("action")
        if action not in ("inspect", "import"):
            return error("action must be inspect or import.", "invalid_request", 400)

        path = body.get("path")
        absolute = resolve_file(project_root(), path)
        if format_for(path) is None:
            return error(
                f"Visivo cannot import {os.path.basename(path)} yet. Use a CSV file.",
                "unsupported_format",
                400,
            )
        version_id = body.get("version_id")
        current = store().version_at(path)
        if version_id is not None and (current is None or current["version_id"] != version_id):
            return error(f"That version of {path} is not in this project.", "not_found", 404)
        options = reader_options(path, body.get("options"))
        file = current or file_entry(path, absolute)

        if action == "inspect":
            name = os.path.splitext(os.path.basename(path))[0]
            job_id = SourceOpJobManager.instance().start(
                "file_inspect",
                lambda: {"file": file, "tables": [_read(absolute, path, name, options)]},
            )
            return jsonify({"job_id": job_id, "status": "queued"}), 202

        source_name = body.get("source_name")
        if not isinstance(source_name, str) or not source_name.strip():
            return error("Send a name for the new source.", "invalid_request", 400)
        source_manager = flask_app.source_manager
        imported = existing_import(source_manager, source_name, path)
        if imported is False:
            return error(
                f"A source named {source_name} already exists. Choose another name.",
                "source_exists",
                409,
            )

        def run_import():
            table = _read(absolute, path, source_name, options)
            if not imported:
                source_manager.save_from_config(source_config(source_name, path, options))
            return {
                "file": file,
                "source": source_manager.get_source_with_status(source_name),
                "tables": [table],
            }

        job_id = SourceOpJobManager.instance().start("file_import", run_import)
        return jsonify({"job_id": job_id, "status": "queued"}), 202

    @app.route("/api/project-file-imports/<job_id>/", methods=["GET"])
    def get_project_file_import(job_id):
        job = SourceOpJobManager.instance().get_job(job_id)
        if job is None or job.kind not in IMPORT_JOB_KINDS:
            return error("This import does not exist.", "not_found", 404)
        envelope = job.to_dict()
        envelope.setdefault("result", None)
        return jsonify(envelope)


def _read(absolute, path, name, options):
    try:
        return preview_csv(absolute, name, options)
    except Exception as exc:
        raise RuntimeError(f"Could not read {path}: {exc}") from exc
