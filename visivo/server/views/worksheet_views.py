from flask import jsonify, request
from visivo.logger.logger import Logger
from visivo.server.services.query_service import execute_query_on_source
import json
from visivo.utils import get_utc_now


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

            result = flask_app.worksheet_repo.create_worksheet(name=data["name"])
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
                selected_source=data.get("selected_source"),
                associated_model=data.get("associated_model"),
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

    @app.route("/api/worksheet/<worksheet_id>/cells/<cell_id>/execute/", methods=["POST"])
    def execute_cell(worksheet_id, cell_id):
        """Execute a cell's query."""
        try:
            # Get the cell
            cell_data = flask_app.worksheet_repo.get_cell(cell_id)
            if not cell_data:
                return jsonify({"message": "Cell not found"}), 404

            cell = cell_data["cell"]

            # Validate that the cell belongs to the specified worksheet
            if cell.get("worksheet_id") != worksheet_id:
                return jsonify({"message": "Worksheet not found"}), 404

            query_text = cell.get("query_text", "")

            if not query_text or not query_text.strip():
                return jsonify({"message": "Cell has no query to execute"}), 400

            # Use cell's selected source (query service will handle project defaults)
            source_name = cell.get("selected_source")

            # Execute the query using the query service
            result_data = execute_query_on_source(query_text, source_name, flask_app.project)

            # Prepare query stats
            query_stats = {
                "timestamp": get_utc_now().isoformat(),
                "source": result_data["source_name"],
                "executionTime": result_data["execution_time"],
            }

            # Save the results to the database
            flask_app.worksheet_repo.save_cell_result(
                cell_id=cell_id,
                results_json=json.dumps(
                    {"columns": result_data["columns"], "rows": result_data["rows"]}
                ),
                query_stats_json=json.dumps(query_stats),
                is_truncated=result_data["is_truncated"],
            )

            # Return the results
            return (
                jsonify(
                    {
                        "columns": result_data["columns"],
                        "rows": result_data["rows"],
                        "is_truncated": result_data["is_truncated"],
                        "query_stats": query_stats,
                    }
                ),
                200,
            )

        except ValueError as e:
            Logger.instance().error(f"Error executing cell: {str(e)}")
            return jsonify({"message": str(e)}), 400
        except Exception as e:
            Logger.instance().error(f"Error executing cell: {str(e)}")
            return jsonify({"message": str(e)}), 500
