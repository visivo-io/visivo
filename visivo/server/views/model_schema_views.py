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

from visivo.jobs.utils import get_source_for_model
from visivo.logger.logger import Logger
from visivo.models.models.sql_model import SqlModel
from visivo.query.model_schema_inference import infer_model_columns
from visivo.query.schema_aggregator import SchemaAggregator


def _columns_payload(column_map: dict) -> list:
    """Shape ``{col: DataType}`` as the ``{name, type, nullable}`` rows the client renders.

    Same item shape the source columns feed uses, so one column-row renderer
    serves both. Sorted by name for a stable list.

    ``nullable`` is ``None`` rather than ``True``: SQLGlot annotates types, not
    nullability, and claiming everything is nullable would be inventing an
    answer. The source feed knows because introspection told it.
    """
    return sorted(
        (
            {"name": name, "type": str(dtype) if dtype is not None else "UNKNOWN", "nullable": None}
            for name, dtype in column_map.items()
        ),
        key=lambda c: c["name"],
    )


def _find_model(project, model_name: str):
    """Find a model by name on the project. Returns None when absent."""
    for model in project.models or []:
        if getattr(model, "name", None) == model_name:
            return model
    return None


def _find_source(project, source_name: str):
    for source in project.sources or []:
        if source.name == source_name:
            return source
    return None


def register_model_schema_views(app, flask_app, output_dir):
    """Register on-demand model schema inference endpoints."""

    def _infer(sql: str, source, model_hash: str):
        """Infer columns for ``sql`` against ``source``'s cached schema."""
        stored_source_schema = SchemaAggregator.load_source_schema(
            source_name=source.name, output_dir=output_dir
        )
        column_map = infer_model_columns(
            sql=sql,
            sqlglot_dialect=source.get_sqlglot_dialect(),
            model_hash=model_hash,
            stored_source_schema=stored_source_schema,
            # The editor asks on every keystroke; half-written SQL is normal.
            # A parse failure is "nothing resolved yet", not a 500.
            strict=False,
        )
        return jsonify(
            {
                "columns": _columns_payload(column_map),
                "source_name": source.name,
                # False when the source has never been introspected. The columns
                # are still the best available answer (a query naming its own
                # columns annotates fine), but a caller showing an empty list
                # can tell "nothing resolved" from "no schema to resolve
                # against" and prompt to generate one.
                "source_schema_cached": stored_source_schema is not None,
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
            project = flask_app.project

            model = _find_model(project, model_name)
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
                source = _find_source(project, source_name)
            else:
                source = get_source_for_model(model, project.dag(), output_dir)

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

            source = _find_source(flask_app.project, source_name)
            if source is None:
                return jsonify({"error": f"Source '{source_name}' not found"}), 404

            # No saved model, so no name_hash to key by. The hash is only
            # schema_from_sql's output key and never leaves this function.
            return _infer(sql, source, SqlModel(name="__draft__", sql=sql).name_hash())

        except Exception as e:
            Logger.instance().error(f"Error inferring draft model schema: {str(e)}")
            return jsonify({"error": str(e)}), 500
