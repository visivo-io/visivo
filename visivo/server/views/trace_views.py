import json
import os
import glob
from flask import jsonify, request, send_file

from visivo.logger.logger import Logger
from visivo.models.base.named_model import alpha_hash
from visivo.utils import get_utc_now
from visivo.server.services.query_service import execute_query_on_source


def register_trace_views(app, flask_app, output_dir):
    @app.route("/api/traces/<hash>/")
    def serve_trace_data_by_hash(hash):
        """API endpoint to serve trace data by hash"""
        try:
            # Find trace name by hash
            trace_dirs = glob.glob(f"{output_dir}/traces/*/")
            for trace_dir in trace_dirs:
                trace_name = os.path.basename(os.path.normpath(trace_dir))
                trace_name_hash = alpha_hash(trace_name)
                if trace_name_hash == hash:
                    data_file = os.path.join(trace_dir, "data.json")
                    if os.path.exists(data_file):
                        return send_file(data_file)
                    break

            return jsonify({"message": f"Trace data not found for hash: {hash}"}), 404
        except Exception as e:
            Logger.instance().error(f"Error serving trace data by hash: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/traces/", methods=["GET"])
    def get_traces_api():
        """API endpoint for traces data"""
        try:
            # Get trace names from query parameters
            trace_names = request.args.getlist("trace_names")
            project_id = request.args.get("project_id")

            # Return traces with hash-based data URLs
            traces = []
            for name in trace_names:
                name_hash = alpha_hash(name)
                traces.append(
                    {
                        "name": name,
                        "id": name,
                        "signed_data_file_url": f"/api/traces/{name_hash}/",
                    }
                )

            return jsonify(traces)
        except Exception as e:
            Logger.instance().error(f"Error fetching traces data: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/query/<project_id>/", methods=["POST"])
    def execute_query(project_id):
        try:
            data = request.get_json()
            if not data or "query" not in data:
                return jsonify({"message": "No query provided"}), 400

            query = data["query"]
            source_name = data.get("source")
            worksheet_id = data.get("worksheet_id")

            # Use the query service to execute the query
            # This provides enhanced error messages, result truncation, and execution time tracking
            response_data = execute_query_on_source(query, source_name, flask_app._project)

            # If worksheet_id is provided, save the results
            if worksheet_id:
                query_stats = {
                    "timestamp": get_utc_now().isoformat(),
                    "source": response_data["source_name"],
                    "execution_time": response_data["execution_time"],
                    "is_truncated": response_data.get("is_truncated", False),
                }
                # Save results (excluding source_name and execution_time from saved data)
                result_data = {
                    "columns": response_data["columns"],
                    "rows": response_data["rows"],
                }
                flask_app.worksheet_repo.save_results(
                    worksheet_id, json.dumps(result_data), json.dumps(query_stats)
                )

            return jsonify(response_data), 200

        except ValueError as e:
            # ValueError is raised by query_service with enhanced error messages
            return jsonify({"message": str(e)}), 400
        except Exception as e:
            Logger.instance().error(f"Query execution error: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/trace/<trace_name>/query/", methods=["GET"])
    def get_trace_query(trace_name):
        try:
            query_file_path = f"{output_dir}/traces/{trace_name}/query.sql"
            if not os.path.exists(query_file_path):
                return (
                    jsonify({"message": f"Query file not found for trace: {trace_name}"}),
                    404,
                )

            with open(query_file_path, "r") as f:
                query_contents = f.read()

            return jsonify({"query": query_contents}), 200
        except Exception as e:
            Logger.instance().error(f"Error reading trace query: {str(e)}")
            return jsonify({"message": str(e)}), 500
