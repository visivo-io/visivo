from flask import jsonify, request
from pydantic import ValidationError
from visivo.logger.logger import Logger
from visivo.models.theme import Theme


def current_theme_config(flask_app):
    """The draft theme if one is cached, otherwise the published one, as JSON-ready data."""
    theme = flask_app._cached_theme or flask_app.project.theme
    return theme.model_dump(mode="json", exclude_none=True) if theme else {}


def register_theme_views(app, flask_app):
    @app.route("/api/theme/", methods=["GET"])
    def get_theme():
        try:
            return jsonify(current_theme_config(flask_app))
        except Exception as e:
            Logger.instance().error(f"Error fetching theme: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/theme/", methods=["POST"])
    def save_theme():
        """Validate and cache the theme as a draft until the next commit."""
        config = request.get_json(silent=True)
        if not isinstance(config, dict):
            return jsonify({"error": "Theme configuration is required"}), 400
        try:
            flask_app._cached_theme = Theme(**config)
        except ValidationError as e:
            first_error = e.errors()[0]
            location = ".".join(str(part) for part in first_error["loc"])
            return jsonify({"error": f"Invalid theme: {location}: {first_error['msg']}"}), 400
        return jsonify({"message": "Theme saved to cache"}), 200
