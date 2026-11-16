"""Secrets (docs/contracts/project-files-and-credentials.md). VIS-1764 implements them."""

from visivo.server.views.project_files_views import not_implemented


def register_secrets_views(app, flask_app, output_dir):
    @app.route("/api/secrets/", methods=["POST"])
    def create_secret():
        return not_implemented("VIS-1764")
