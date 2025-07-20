from flask import jsonify, request
from visivo.logger.logger import Logger


def register_worksheet_views(app, flask_app, output_dir):

    @app.route("/api/worksheet", methods=["GET"])
    def list_worksheets():
        """List all worksheets."""
        try:
            worksheets = flask_app.worksheet_repo.list_worksheets()
            return jsonify(worksheets)
        except Exception as e:
            Logger.instance().error(f"Error listing worksheets: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/<worksheet_id>", methods=["GET"])
    def get_worksheet(worksheet_id):
        """Get a specific worksheet."""
        try:
            worksheet = flask_app.worksheet_repo.get_worksheet(worksheet_id)
            if worksheet is None:
                return jsonify({"message": "Worksheet not found"}), 404
            return jsonify(worksheet)
        except Exception as e:
            Logger.instance().error(f"Error getting worksheet: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet", methods=["POST"])
    def create_worksheet():
        """Create a new worksheet."""
        try:
            data = request.get_json()
            if not data or "name" not in data:
                return jsonify({"message": "Name is required"}), 400

            result = flask_app.worksheet_repo.create_worksheet(
                name=data["name"],
                query=data.get("query", ""),
                selected_source=data.get("selected_source"),
            )
            return jsonify(result), 201
        except Exception as e:
            Logger.instance().error(f"Error creating worksheet: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/<worksheet_id>", methods=["PUT"])
    def update_worksheet(worksheet_id):
        """Update a worksheet."""
        try:
            data = request.get_json()
            if not data:
                return jsonify({"message": "No update data provided"}), 400

            success = flask_app.worksheet_repo.update_worksheet(worksheet_id, data)
            if not success:
                return jsonify({"message": "Worksheet not found"}), 404

            return jsonify({"message": "Worksheet updated successfully"})
        except Exception as e:
            Logger.instance().error(f"Error updating worksheet: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/<worksheet_id>", methods=["DELETE"])
    def delete_worksheet(worksheet_id):
        """Delete a worksheet."""
        try:
            success = flask_app.worksheet_repo.delete_worksheet(worksheet_id)
            if not success:
                return jsonify({"message": "Worksheet not found"}), 404
            return jsonify({"message": "Worksheet deleted successfully"})
        except Exception as e:
            Logger.instance().error(f"Error deleting worksheet: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/session", methods=["GET"])
    def get_session_state():
        """Get the current session state."""
        try:
            worksheets = flask_app.worksheet_repo.list_worksheets()
            return jsonify([w["session_state"] for w in worksheets])
        except Exception as e:
            Logger.instance().error(f"Error getting session state: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/session", methods=["PUT"])
    def update_session_state():
        """Update the session state."""
        try:
            data = request.get_json()
            if not isinstance(data, list):
                return jsonify({"message": "Expected array of session states"}), 400

            success = flask_app.worksheet_repo.update_session_states(data)
            if not success:
                return jsonify({"message": "Failed to update session state"}), 500

            return jsonify({"message": "Session state updated successfully"})
        except Exception as e:
            Logger.instance().error(f"Error updating session state: {str(e)}")
            return jsonify({"message": str(e)}), 500
