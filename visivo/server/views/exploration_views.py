from flask import jsonify, request
from visivo.logger.logger import Logger


def register_exploration_views(app, flask_app, output_dir):

    @app.route("/api/explorations/", methods=["GET"])
    def list_explorations():
        try:
            explorations = flask_app.exploration_repo.list_explorations()
            return jsonify(explorations)
        except Exception as e:
            Logger.instance().error(f"Error listing explorations: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/explorations/", methods=["POST"])
    def create_exploration():
        try:
            data = request.get_json() or {}
            name = data.get("name", "Untitled")
            result = flask_app.exploration_repo.create_exploration(name=name)
            return jsonify(result), 201
        except Exception as e:
            Logger.instance().error(f"Error creating exploration: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/explorations/<exploration_id>/", methods=["GET"])
    def get_exploration(exploration_id):
        try:
            exploration = flask_app.exploration_repo.get_exploration(exploration_id)
            if exploration is None:
                return jsonify({"message": "Exploration not found"}), 404
            return jsonify(exploration)
        except Exception as e:
            Logger.instance().error(f"Error getting exploration: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/explorations/<exploration_id>/", methods=["PUT"])
    def update_exploration(exploration_id):
        try:
            data = request.get_json(silent=True)
            if not data:
                return jsonify({"message": "No update data provided"}), 400

            result = flask_app.exploration_repo.update_exploration(exploration_id, data)
            if result is None:
                return jsonify({"message": "Exploration not found"}), 404
            return jsonify(result)
        except Exception as e:
            Logger.instance().error(f"Error updating exploration: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/explorations/<exploration_id>/", methods=["DELETE"])
    def delete_exploration(exploration_id):
        try:
            success = flask_app.exploration_repo.delete_exploration(exploration_id)
            if not success:
                return jsonify({"message": "Exploration not found"}), 404
            return jsonify({"message": "Exploration deleted successfully"})
        except Exception as e:
            Logger.instance().error(f"Error deleting exploration: {str(e)}")
            return jsonify({"message": str(e)}), 500
