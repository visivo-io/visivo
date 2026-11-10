"""Project files and file imports (docs/contracts/project-files-and-credentials.md).

The routes exist so the viewer, the API contract and the cloud agree on them;
VIS-1762 implements them.
"""

from flask import jsonify


def not_implemented(issue):
    return (
        jsonify({"error": f"Not available yet ({issue}).", "code": "not_implemented"}),
        501,
    )


def register_project_files_views(app, flask_app, output_dir):
    @app.route("/api/project-files/", methods=["GET"])
    def list_project_files():
        return not_implemented("VIS-1283")

    @app.route("/api/project-files/uploads/", methods=["POST"])
    def create_project_file_upload():
        return not_implemented("VIS-1762")

    @app.route("/api/project-files/uploads/<upload_id>/content/", methods=["PUT"])
    def put_project_file_upload_content(upload_id):
        return not_implemented("VIS-1762")

    @app.route("/api/project-files/uploads/<upload_id>/complete/", methods=["POST"])
    def complete_project_file_upload(upload_id):
        return not_implemented("VIS-1762")

    @app.route("/api/project-file-imports/", methods=["POST"])
    def start_project_file_import():
        return not_implemented("VIS-1762")

    @app.route("/api/project-file-imports/<job_id>/", methods=["GET"])
    def get_project_file_import(job_id):
        return not_implemented("VIS-1762")
