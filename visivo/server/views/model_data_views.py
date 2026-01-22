"""Model data views for retrieving and executing model data."""

from flask import jsonify, request
from visivo.server.services.model_data_service import ModelDataService
from visivo.logger.logger import Logger


def register_model_data_views(app, flask_app, output_dir):
    """
    Register model data routes.

    Args:
        app: Flask application
        flask_app: FlaskApp instance with managers
        output_dir: Directory for parquet cache files
    """
    model_data_service = ModelDataService(
        output_dir, flask_app.model_manager, flask_app.source_manager
    )

    @app.route("/api/models/<model_name>/data/", methods=["GET"])
    def get_model_data(model_name):
        """
        Get model data with pagination.

        If parquet exists, reads from cache. Otherwise executes
        model query on-demand and caches result.

        Query params:
            limit: Number of rows (default: 100, max: 10000)
            offset: Row offset (default: 0)

        Returns:
            JSON with columns, rows, and metadata
        """
        try:
            limit = request.args.get("limit", 100, type=int)
            offset = request.args.get("offset", 0, type=int)

            # Validate params
            limit = min(max(limit, 1), 10000)
            offset = max(offset, 0)

            data = model_data_service.get_model_data(model_name, limit, offset)
            return jsonify(data), 200

        except ValueError as e:
            return jsonify({"error": str(e)}), 404
        except Exception as e:
            Logger.instance().error(f"Error getting data for model {model_name}: {e}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/models/<model_name>/run/", methods=["POST"])
    def run_model(model_name):
        """
        Execute model SQL and cache result as parquet.

        Request body (optional):
            sql: Custom SQL to execute (uses model's SQL if not provided)

        Returns:
            JSON with execution result metadata
        """
        try:
            body = request.get_json(silent=True) or {}
            custom_sql = body.get("sql")

            result = model_data_service.run_model(model_name, custom_sql)
            return jsonify(result), 200

        except ValueError as e:
            return jsonify({"error": str(e)}), 404
        except Exception as e:
            Logger.instance().error(f"Error running model {model_name}: {e}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/models/<model_name>/status/", methods=["GET"])
    def get_model_status(model_name):
        """
        Get the current status of a model.

        Returns:
            JSON with model status information
        """
        try:
            status = model_data_service.get_model_status(model_name)

            if not status["exists"]:
                return jsonify({"error": f"Model '{model_name}' not found"}), 404

            return jsonify(status), 200

        except Exception as e:
            Logger.instance().error(f"Error getting status for model {model_name}: {e}")
            return jsonify({"error": str(e)}), 500
