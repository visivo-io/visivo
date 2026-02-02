from flask import jsonify, request
from pydantic import ValidationError
from visivo.logger.logger import Logger
from visivo.models.defaults import Defaults


def register_defaults_views(app, flask_app, output_dir):
    """Register defaults-related API endpoints."""

    @app.route("/api/defaults/", methods=["GET"])
    def get_defaults():
        """Return the current project defaults."""
        try:
            if flask_app._cached_defaults is not None:
                return jsonify(
                    flask_app._cached_defaults.model_dump(mode="json", exclude_none=True)
                )
            if flask_app.project.defaults:
                return jsonify(
                    flask_app.project.defaults.model_dump(mode="json", exclude_none=True)
                )
            return jsonify({})
        except Exception as e:
            Logger.instance().error(f"Error fetching defaults: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/defaults/save/", methods=["POST"])
    def save_defaults():
        """Save defaults configuration to cache (draft state)."""
        try:
            config = request.get_json(silent=True)
            if config is None:
                return jsonify({"error": "Defaults configuration is required"}), 400

            defaults = Defaults(**config)
            flask_app._cached_defaults = defaults
            return (
                jsonify({"message": "Defaults saved to cache"}),
                200,
            )
        except ValidationError as e:
            Logger.instance().debug(f"Defaults validation failed: {e}")
            first_error = e.errors()[0]
            return (
                jsonify(
                    {
                        "error": f"Invalid defaults configuration: {first_error['loc']}: {first_error['msg']}"
                    }
                ),
                400,
            )
        except Exception as e:
            Logger.instance().error(f"Error saving defaults: {str(e)}")
            return jsonify({"error": str(e)}), 500
