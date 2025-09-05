import glob
import hashlib
import os
from flask import jsonify, request, send_file

from visivo.logger.logger import Logger


def register_insight_views(app, flask_app, output_dir):
    @app.route("/api/insights/<hash>/")
    def serve_insight_data_by_hash(hash):
        """API endpoint to serve insight data by hash"""
        try:
            # Find insight name by hash
            insight_dirs = glob.glob(os.path.join(output_dir, "insights", "*"))

            for insight_dir in insight_dirs:
                insight_name = os.path.basename(os.path.normpath(insight_dir))
                insight_name_hash = hashlib.md5(insight_name.encode()).hexdigest()
                if insight_name_hash == hash:
                    data_file = os.path.join(insight_dir, "insight.json")
                    if os.path.exists(data_file):
                        return send_file(data_file)
                    break

            return jsonify({"message": f"Insight data not found for hash: {hash}"}), 404
        except Exception as e:
            Logger.instance().error(f"Error serving insight data by hash: {str(e)}")
            return jsonify({"message": str(e)}), 500

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
                        "signed_data_file_url": f"/api/insights/{name_hash}/",
                    }
                )

            return jsonify(insights)
        except Exception as e:
            Logger.instance().error(f"Error fetching insights data: {str(e)}")
            return jsonify({"message": str(e)}), 500
