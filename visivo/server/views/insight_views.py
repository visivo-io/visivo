import hashlib
from flask import jsonify, request

from visivo.logger.logger import Logger


def register_insight_views(app, flask_app, output_dir):

    @app.route("/api/insights/", methods=["GET"])
    def get_insights_api():
        try:
            insight_names = request.args.getlist("insight_names")
            project_id = request.args.get("project_id")

            insights = []
            for name in insight_names:
                name_hash = hashlib.md5(name.encode()).hexdigest()
                insights.append(
                    {
                        "name": name,
                        "id": name,
                        "signed_data_file_url": f"/api/files/{name_hash}/",
                    }
                )

            return jsonify(insights)
        except Exception as e:
            Logger.instance().error(f"Error fetching insights data: {str(e)}")
            return jsonify({"message": str(e)}), 500
