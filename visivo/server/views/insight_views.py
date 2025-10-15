import hashlib
import json
import os
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
                insight_file = os.path.join(output_dir, "insights", f"{name_hash}.json")

                insight_data = {"id": name}

                with open(insight_file, "r") as f:
                    file_contents = json.load(f)
                    # Merge file contents into insight_data
                    insight_data.update(file_contents)

                insights.append(insight_data)

            return jsonify(insights)
        except Exception as e:
            Logger.instance().error(f"Error fetching insights data: {str(e)}")
            return jsonify({"message": str(e)}), 500
