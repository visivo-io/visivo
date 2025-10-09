from flask import jsonify, request
from visivo.logger.logger import Logger


def register_worksheet_views(app, flask_app, output_dir):

    @app.route("/api/worksheet/", methods=["GET"])
    def list_worksheets():
        """List all worksheets."""
        try:
            worksheets = flask_app.worksheet_repo.list_worksheets()
            return jsonify(worksheets)
        except Exception as e:
            Logger.instance().error(f"Error listing worksheets: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/<worksheet_id>/", methods=["GET"])
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

    @app.route("/api/worksheet/", methods=["POST"])
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

    @app.route("/api/worksheet/<worksheet_id>/", methods=["PUT"])
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

    @app.route("/api/worksheet/<worksheet_id>/", methods=["DELETE"])
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

    @app.route("/api/worksheet/session/", methods=["GET"])
    def get_session_state():
        """Get the current session state."""
        try:
            worksheets = flask_app.worksheet_repo.list_worksheets()
            return jsonify([w["session_state"] for w in worksheets])
        except Exception as e:
            Logger.instance().error(f"Error getting session state: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/session/", methods=["PUT"])
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

    # Cell endpoints
    @app.route("/api/worksheet/<worksheet_id>/cells/", methods=["GET"])
    def list_cells(worksheet_id):
        """List all cells for a worksheet."""
        try:
            cells = flask_app.worksheet_repo.list_cells(worksheet_id)
            return jsonify(cells)
        except Exception as e:
            Logger.instance().error(f"Error listing cells: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/<worksheet_id>/cells/", methods=["POST"])
    def create_cell(worksheet_id):
        """Create a new cell for a worksheet."""
        try:
            data = request.get_json() or {}
            cell = flask_app.worksheet_repo.create_cell(
                worksheet_id=worksheet_id,
                query_text=data.get("query_text", ""),
                cell_order=data.get("cell_order"),
            )
            if cell is None:
                return jsonify({"message": "Worksheet not found"}), 404
            return jsonify(cell), 201
        except Exception as e:
            Logger.instance().error(f"Error creating cell: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/<worksheet_id>/cells/<cell_id>/", methods=["GET"])
    def get_cell(worksheet_id, cell_id):
        """Get a specific cell."""
        try:
            cell = flask_app.worksheet_repo.get_cell(cell_id)
            if cell is None:
                return jsonify({"message": "Cell not found"}), 404
            return jsonify(cell)
        except Exception as e:
            Logger.instance().error(f"Error getting cell: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/<worksheet_id>/cells/<cell_id>/", methods=["PUT"])
    def update_cell(worksheet_id, cell_id):
        """Update a cell."""
        try:
            data = request.get_json()
            if not data:
                return jsonify({"message": "No update data provided"}), 400

            success = flask_app.worksheet_repo.update_cell(cell_id, data)
            if not success:
                return jsonify({"message": "Cell not found"}), 404

            return jsonify({"message": "Cell updated successfully"})
        except Exception as e:
            Logger.instance().error(f"Error updating cell: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/<worksheet_id>/cells/<cell_id>/", methods=["DELETE"])
    def delete_cell(worksheet_id, cell_id):
        """Delete a cell."""
        try:
            success = flask_app.worksheet_repo.delete_cell(cell_id)
            if not success:
                return jsonify({"message": "Cell not found"}), 404
            return jsonify({"message": "Cell deleted successfully"})
        except Exception as e:
            Logger.instance().error(f"Error deleting cell: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/<worksheet_id>/cells/reorder/", methods=["PUT"])
    def reorder_cells(worksheet_id):
        """Reorder cells in a worksheet."""
        try:
            data = request.get_json()
            if not data or "cell_order" not in data:
                return jsonify({"message": "cell_order array required"}), 400

            success = flask_app.worksheet_repo.reorder_cells(worksheet_id, data["cell_order"])
            if not success:
                return jsonify({"message": "Failed to reorder cells"}), 500

            return jsonify({"message": "Cells reordered successfully"})
        except Exception as e:
            Logger.instance().error(f"Error reordering cells: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/worksheet/<worksheet_id>/cells/<cell_id>/execute/", methods=["POST"])
    def execute_cell(worksheet_id, cell_id):
        """Execute a cell's query."""
        try:
            # Get the cell
            cell_data = flask_app.worksheet_repo.get_cell(cell_id)
            if not cell_data:
                return jsonify({"message": "Cell not found"}), 404

            cell = cell_data["cell"]
            query_text = cell.get("query_text", "")

            if not query_text or not query_text.strip():
                return jsonify({"message": "Cell has no query to execute"}), 400

            # Get worksheet to get selected source
            worksheet_data = flask_app.worksheet_repo.get_worksheet(worksheet_id)
            if not worksheet_data:
                return jsonify({"message": "Worksheet not found"}), 404

            worksheet = worksheet_data["worksheet"]
            source_name = worksheet.get("selected_source")

            # Execute the query using the existing query execution logic
            # This will need to be implemented to use the query execution service
            # For now, return a placeholder
            return (
                jsonify(
                    {
                        "message": "Query execution will be implemented with query service integration"
                    }
                ),
                501,
            )

        except Exception as e:
            Logger.instance().error(f"Error executing cell: {str(e)}")
            return jsonify({"message": str(e)}), 500
