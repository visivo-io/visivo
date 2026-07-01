"""
Model schema views — read-only endpoints for the model output column schema
artifact written during the run phase.

Mirrors the source schema route (``source_schema_jobs_views.py``) but read-only:
models are produced by the normal ``visivo run`` (not on-demand), so there is no
POST/generate/poll surface. The schema is the cheap, cloud-shippable sibling of
the ``/api/models/<name>/data/`` endpoint.

Routes:
- GET /api/model-schema-jobs/<model_name>/          → the full schema envelope
- GET /api/model-schema-jobs/<model_name>/columns/  → [{name, type, nullable}, ...]
"""

from flask import jsonify, request

from visivo.constants import DEFAULT_RUN_ID
from visivo.logger.logger import Logger
from visivo.query.model_schema_aggregator import ModelSchemaAggregator


def _load_model_schema_with_fallback(model_name: str, output_dir: str, run_id: str = None):
    """Load a model schema artifact with optional explicit run_id or fallback.

    Mirrors ``_load_schema_with_fallback`` in source_schema_jobs_views: an
    explicit ``run_id`` is honored as-is; otherwise try ``main`` first, then the
    ``preview-<model_name>`` run.

    Returns:
        Tuple of (schema_data, run_id) or (None, None) if not found.
    """
    if run_id is not None:
        schema_data = ModelSchemaAggregator.load_model_schema(model_name, output_dir, run_id=run_id)
        if schema_data is not None:
            return schema_data, run_id
        return None, None

    schema_data = ModelSchemaAggregator.load_model_schema(
        model_name, output_dir, run_id=DEFAULT_RUN_ID
    )
    if schema_data is not None:
        return schema_data, DEFAULT_RUN_ID

    preview_run_id = f"preview-{model_name}"
    schema_data = ModelSchemaAggregator.load_model_schema(
        model_name, output_dir, run_id=preview_run_id
    )
    if schema_data is not None:
        return schema_data, preview_run_id

    return None, None


def register_model_schema_jobs_views(app, flask_app, output_dir):
    """Register read-only model schema endpoints."""

    @app.route("/api/model-schema-jobs/<model_name>/", methods=["GET"])
    def get_model_schema(model_name):
        """Return the stored model schema envelope.

        Query params:
            run_id: Optional explicit run_id (defaults to main → preview fallback).

        Returns:
            JSON schema envelope, or 404 if no artifact exists.
        """
        try:
            run_id_param = request.args.get("run_id")
            schema_data, _ = _load_model_schema_with_fallback(
                model_name, output_dir, run_id=run_id_param
            )

            if schema_data is None:
                return (
                    jsonify(
                        {
                            "message": f"Schema not found for model '{model_name}'. "
                            "Has the model been run yet?"
                        }
                    ),
                    404,
                )

            return jsonify(schema_data)

        except Exception as e:
            Logger.instance().error(f"Error getting schema for model {model_name}: {str(e)}")
            return jsonify({"message": str(e)}), 500

    @app.route("/api/model-schema-jobs/<model_name>/columns/", methods=["GET"])
    def list_model_schema_columns(model_name):
        """List columns for a model's output schema.

        Returns the same item shape as the source columns endpoint
        (``{name, type, nullable}``) so the frontend can share a column-row
        renderer. Sorted by name; supports ``?search=``.

        Query params:
            run_id: Optional explicit run_id (defaults to main → preview fallback).
            search: Optional case-insensitive filter on column name.

        Returns:
            JSON array of column objects, or 404 if no artifact exists.
        """
        try:
            run_id_param = request.args.get("run_id")
            schema_data, _ = _load_model_schema_with_fallback(
                model_name, output_dir, run_id=run_id_param
            )

            if schema_data is None:
                return (
                    jsonify({"message": f"Schema not found for model '{model_name}'"}),
                    404,
                )

            search = request.args.get("search", "").lower()
            columns = []

            for col_name, col_info in schema_data.get("columns", {}).items():
                if search and search not in col_name.lower():
                    continue

                columns.append(
                    {
                        "name": col_name,
                        "type": col_info.get("type", "unknown"),
                        "nullable": col_info.get("nullable", True),
                    }
                )

            columns.sort(key=lambda c: c["name"])

            return jsonify(columns)

        except Exception as e:
            Logger.instance().error(f"Error listing columns for model {model_name}: {str(e)}")
            return jsonify({"message": str(e)}), 500
