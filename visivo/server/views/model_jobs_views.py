import os

from flask import jsonify, request

from visivo.constants import DEFAULT_RUN_ID
from visivo.logger.logger import Logger


def register_model_jobs_views(app, flask_app, output_dir):
    """``/api/model-jobs/`` — a model's built data, as a file reference.

    The third member of the deploy-artifact family alongside
    ``/api/insight-jobs/`` and ``/api/input-jobs/``, and shaped exactly like
    them: ``(project_id, model_names[])`` in, one record per model out, each
    carrying a ``signed_data_file_url`` the client then fetches.

    It replaced ``/api/models/<name>/data/``, which read the parquet
    server-side and inlined up to 10k rows — so the server paid the memory, the
    rows were silently truncated, and in cloud the artifact bytes travelled back
    through the API instead of being fetched from storage. Handing back a URL is
    what avoids that, which is why every other artifact type already did.

    ``project_id`` is accepted and ignored here, as in the sibling views: this
    server has one project. Cloud requires it, and the viewer is the same code
    in both.
    """

    @app.route("/api/model-jobs/", methods=["GET"])
    def get_model_jobs_api():
        try:
            model_names = request.args.getlist("model_names")
            run_id = request.args.get("run_id", DEFAULT_RUN_ID)

            if not model_names:
                return jsonify({"error": "model_names parameter is required"}), 400

            model_jobs = []
            missing = []

            for name in model_names:
                data_file = os.path.join(output_dir, run_id, "files", f"{name}.parquet")
                if not os.path.exists(data_file):
                    Logger.instance().info(f"Model data file not found: {data_file}")
                    missing.append(name)
                    continue

                model_jobs.append(
                    {
                        "id": name,
                        "name": name,
                        # Same indirection the insight/input views use: the
                        # response names a file, the client fetches it.
                        "signed_data_file_url": f"/api/files/{name}/{run_id}/",
                    }
                )

            if missing:
                Logger.instance().info(f"Missing model data files: {missing}")
                # A model with no built data is a normal state (never run, or
                # run before this model existed), so an empty list is a valid
                # answer — matching the insight view, which only 404s when it
                # found nothing at all.
                if not model_jobs:
                    return (
                        jsonify({"error": f"No model data files found for: {missing}"}),
                        404,
                    )

            return jsonify(model_jobs)

        except Exception as e:
            Logger.instance().error(f"Error loading model jobs: {str(e)}")
            return jsonify({"error": str(e)}), 500
