from flask import jsonify, request
from pydantic import ValidationError
from visivo.logger.logger import Logger


def register_relation_views(app, flask_app, output_dir):
    """Register relation-related API endpoints."""

    @app.route("/api/relations/", methods=["GET"])
    def list_all_relations():
        """List all relations (cached + published) with status."""
        try:
            relations = flask_app.relation_manager.get_all_relations_with_status()
            return jsonify({"relations": relations})
        except Exception as e:
            Logger.instance().error(f"Error listing relations: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/relations/<relation_name>/", methods=["GET"])
    def get_relation(relation_name):
        """Get relation configuration with status information."""
        try:
            result = flask_app.relation_manager.get_relation_with_status(relation_name)
            if not result:
                return jsonify({"error": f"Relation '{relation_name}' not found"}), 404
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error getting relation: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/relations/<relation_name>/save/", methods=["POST"])
    def save_relation(relation_name):
        """Save a relation configuration to cache (draft state)."""
        try:
            relation_config = request.get_json(silent=True)
            if not relation_config:
                return jsonify({"error": "Relation configuration is required"}), 400

            # Ensure name matches URL parameter
            relation_config["name"] = relation_name

            relation = flask_app.relation_manager.save_from_config(relation_config)
            status = flask_app.relation_manager.get_status(relation_name)
            return (
                jsonify(
                    {
                        "message": "Relation saved to cache",
                        "relation": relation_name,
                        "status": status.value if status else None,
                    }
                ),
                200,
            )
        except ValidationError as e:
            Logger.instance().debug(f"Relation validation failed: {e}")
            first_error = e.errors()[0]
            return (
                jsonify(
                    {
                        "error": f"Invalid relation configuration: {first_error['loc']}: {first_error['msg']}"
                    }
                ),
                400,
            )
        except Exception as e:
            Logger.instance().error(f"Error saving relation: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/relations/<relation_name>/", methods=["DELETE"])
    def delete_relation(relation_name):
        """Mark a relation for deletion (will be removed from YAML on publish)."""
        try:
            marked = flask_app.relation_manager.mark_for_deletion(relation_name)
            if marked:
                return (
                    jsonify(
                        {
                            "message": f"Relation '{relation_name}' marked for deletion",
                            "status": "deleted",
                        }
                    ),
                    200,
                )
            else:
                return jsonify({"error": f"Relation '{relation_name}' not found"}), 404
        except Exception as e:
            Logger.instance().error(f"Error deleting relation: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/relations/<relation_name>/validate/", methods=["POST"])
    def validate_relation(relation_name):
        """Validate a relation configuration without saving it."""
        try:
            relation_config = request.get_json(silent=True)
            if not relation_config:
                return jsonify({"error": "Relation configuration is required"}), 400

            # Ensure name matches URL parameter
            relation_config["name"] = relation_name

            result = flask_app.relation_manager.validate_config(relation_config)
            if result.get("valid"):
                return jsonify(result), 200
            else:
                return jsonify(result), 400
        except Exception as e:
            Logger.instance().error(f"Error validating relation: {str(e)}")
            return jsonify({"error": str(e)}), 500
