"""Model output-column schema — inferred on demand, not read from a run.

``POST /api/model-schemas/`` and ``POST /api/model-schemas/<model_name>/``.

These replaced ``GET /api/model-schema-jobs/<name>/`` (+ its ``/columns/``
sibling), which read the artifact a run had written. Two things were wrong with
that:

1. **It was never a job.** No POST, no queue, no poll — just a file read behind
   a ``-jobs`` name, which is the only reason it sat in the same mental bucket
   as test-connection and model-query.
2. **It required a run.** A model that had never been built had no artifact, so
   asking for its columns 404'd. That is what put the ``model_not_run`` branch
   in ``insight_draft_common`` and the pre-execution guard in
   ``useDraftInsightPreview`` — you could not compile a draft insight against a
   model until you had run it.

Inference does not need the run. ``visivo run`` never asked the database what a
model's columns were either: it ran SQLGlot's ``qualify`` + ``annotate_types``
against the source's *cached* schema and then wrote the answer down. So these
endpoints call the same function the run calls
(``visivo.query.model_schema_inference``) and skip the writing. No database
connection, no credentials, no runner — which is why this can answer inline
while test-connection and model-query cannot.

The run still writes the artifact: the field resolver and
``build_schema_overrides`` read it off disk, and that is unchanged.

POST rather than GET because the draft form carries SQL in the body.
"""

from flask import jsonify, request

from visivo.logger.logger import Logger
from visivo.server.services.model_schema import infer_columns
from visivo.server.source_resolution import find_model, find_source, source_for_model


def _columns_payload(columns: dict) -> list:
    """The ``{name, type, nullable}`` rows the source columns feed also uses.
    ``nullable`` is ``None``: SQLGlot annotates types, not nullability."""
    return [
        {"name": name, "type": dtype, "nullable": None} for name, dtype in sorted(columns.items())
    ]


def register_model_schema_views(app, flask_app, output_dir):
    """Register on-demand model schema inference endpoints."""

    def _infer(sql, source, model_hash=None):
        columns, cached = infer_columns(output_dir, sql=sql, source=source, model_hash=model_hash)
        return jsonify(
            {
                "columns": _columns_payload(columns),
                "source_name": source.name,
                "source_schema_cached": cached,
            }
        )

    @app.route("/api/model-schemas/<model_name>/", methods=["POST"])
    def infer_saved_model_schema(model_name):
        """Infer a saved model's output columns.

        Body is optional; ``{sql}`` and/or ``{source_name}`` override what the
        saved model says, which is how the editor asks about SQL it has not
        saved yet without losing the model's identity.
        """
        try:
            body = request.get_json(silent=True) or {}
            model = find_model(flask_app, model_name)
            if model is None:
                return jsonify({"error": f"Model '{model_name}' not found"}), 404

            sql = body.get("sql") or getattr(model, "sql", None)
            if not sql:
                # A non-SQL model (csv, local merge) has no SQL to qualify. That
                # is a property of the model, not a failure to find it.
                return (
                    jsonify({"error": f"Model '{model_name}' has no SQL to infer a schema from"}),
                    400,
                )

            source_name = body.get("source_name")
            if source_name:
                source = find_source(flask_app, source_name)
            else:
                source = source_for_model(flask_app, model, output_dir)

            if source is None:
                return (
                    jsonify({"error": f"No source resolved for model '{model_name}'"}),
                    400,
                )

            return _infer(sql, source, model.name_hash())

        except Exception as e:
            Logger.instance().error(f"Error inferring schema for model {model_name}: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/model-schemas/", methods=["POST"])
    def infer_draft_model_schema():
        """Infer output columns for SQL that has no saved model yet.

        This is the collection POST — the same path the detail route hangs off,
                which is why there is no ambiguity to design around. An earlier shape
                nested this under ``/api/models/``, where ``/api/models/schema/`` was
                also matched by ``/api/models/<model_name>/`` and a model named
                "schema" would have made one of them unreachable.
        """
        try:
            body = request.get_json(silent=True) or {}
            sql = body.get("sql")
            source_name = body.get("source_name")

            if not sql or not source_name:
                return jsonify({"error": "sql and source_name are required"}), 400

            source = find_source(flask_app, source_name)
            if source is None:
                return jsonify({"error": f"Source '{source_name}' not found"}), 404

            return _infer(sql, source)

        except Exception as e:
            Logger.instance().error(f"Error inferring draft model schema: {str(e)}")
            return jsonify({"error": str(e)}), 500
