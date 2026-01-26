import os
from flask import jsonify, send_file
from visivo.logger.logger import Logger


def register_file_views(app, output_dir):
    @app.route("/api/files/<hash>/<run_id>/")
    def serve_file_data_by_hash_with_run(hash, run_id):
        """API endpoint to serve data file by hash from a specific run"""
        try:
            data_file = os.path.join(output_dir, run_id, "files", f"{hash}.parquet")

            if os.path.exists(data_file):
                return send_file(data_file)

            return (
                jsonify({"message": f"Data file not found for hash: {hash} in run: {run_id}"}),
                404,
            )
        except Exception as e:
            Logger.instance().error(f"Error serving data file by hash: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/files/<hash>/")
    def serve_file_data_by_hash(hash):
        """API endpoint to serve data file by hash (defaults to main run for backward compatibility)"""
        return serve_file_data_by_hash_with_run(hash, "main")
