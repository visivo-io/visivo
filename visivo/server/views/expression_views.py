import re

from flask import jsonify, request
from visivo.logger.logger import Logger
import sqlglot
from sqlglot import exp
from visivo.query.patterns import CONTEXT_STRING_VALUE_PATTERN
from visivo.query.sqlglot_utils import get_sqlglot_dialect, has_aggregate_function


def register_expression_views(app, flask_app, output_dir):
    """Register expression translation API endpoints."""

    @app.route("/api/expressions/translate/", methods=["POST"])
    def translate_expressions():
        """Translate SQL expressions from a source dialect to DuckDB dialect.

        Request body:
        {
            "expressions": [
                {"name": "total_revenue", "expression": "SUM(amount)", "type": "metric"},
                {"name": "order_month", "expression": "DATE_TRUNC('month', order_date)", "type": "dimension"}
            ],
            "source_dialect": "postgresql"
        }

        Response:
        {
            "translations": [
                {"name": "total_revenue", "expression": "SUM(amount)", "duckdb_expression": "SUM(amount)", "type": "metric"},
                {"name": "order_month", "expression": "DATE_TRUNC('month', order_date)", "duckdb_expression": "DATE_TRUNC('month', order_date)", "type": "dimension"}
            ],
            "errors": []
        }
        """
        try:
            data = request.get_json(silent=True)
            if not data:
                return jsonify({"error": "Request body is required"}), 400

            expressions = data.get("expressions", [])
            source_dialect = data.get("source_dialect")

            if not expressions:
                return jsonify({"translations": [], "errors": []}), 200

            read_dialect = None
            if source_dialect:
                try:
                    read_dialect = get_sqlglot_dialect(source_dialect)
                except NotImplementedError:
                    read_dialect = None

            translations = []
            errors = []

            for expr_item in expressions:
                name = expr_item.get("name", "")
                expression = expr_item.get("expression", "")
                expr_type = expr_item.get("type", "")

                if not expression:
                    errors.append({"name": name, "error": "Empty expression"})
                    continue

                try:
                    wrapped_sql = f"SELECT {expression} FROM __placeholder__"
                    parsed = sqlglot.parse_one(wrapped_sql, read=read_dialect or "duckdb")

                    select_expr = parsed.expressions[0] if parsed.expressions else None
                    duckdb_expr = select_expr.sql(dialect="duckdb") if select_expr else expression

                    detected_type = expr_type
                    select_expr = parsed.expressions[0] if parsed.expressions else None
                    if select_expr and has_aggregate_function(select_expr):
                        detected_type = "metric"
                    elif not expr_type:
                        detected_type = "dimension"

                    translations.append(
                        {
                            "name": name,
                            "expression": expression,
                            "duckdb_expression": duckdb_expr,
                            "type": expr_type,
                            "detected_type": detected_type,
                        }
                    )
                except Exception as e:
                    Logger.instance().debug(f"Expression translation failed for '{name}': {e}")
                    translations.append(
                        {
                            "name": name,
                            "expression": expression,
                            "duckdb_expression": expression,
                            "type": expr_type,
                        }
                    )
                    errors.append(
                        {
                            "name": name,
                            "error": str(e),
                        }
                    )

            return jsonify({"translations": translations, "errors": errors}), 200

        except Exception as e:
            Logger.instance().error(f"Error translating expressions: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/expressions/validate/", methods=["POST"])
    def validate_expressions():
        """Validate SQL expressions parse under the source dialect (VIS-993).

        Unlike /translate/, which passes unparseable expressions through so the
        explorer degrades gracefully, this endpoint REPORTS parse failures so
        the viewer's validation-as-save gate can block a doomed expression
        before it caches and fires a run.

        Visivo context tokens (${ref(model).column}, ${ref(metric)}) are
        substituted with a neutral identifier before parsing — the pattern is
        the canonical templating-token pattern from visivo.query.patterns, not
        SQL parsing; the resulting pure SQL goes to sqlglot.

        Request body:
        {
            "expressions": [{"name": "avg_value", "expression": "AVG(value)"}],
            "source_dialect": "duckdb"
        }

        Response:
        {"results": [{"name": "avg_value", "valid": true}]}
        with "error" carrying the parse message when valid is false.
        """
        try:
            data = request.get_json(silent=True)
            if not data:
                return jsonify({"error": "Request body is required"}), 400

            expressions = data.get("expressions", [])
            source_dialect = data.get("source_dialect")

            read_dialect = None
            if source_dialect:
                try:
                    read_dialect = get_sqlglot_dialect(source_dialect)
                except NotImplementedError:
                    read_dialect = None

            results = []
            for expr_item in expressions:
                name = expr_item.get("name", "")
                expression = expr_item.get("expression", "")

                if not expression or not expression.strip():
                    results.append({"name": name, "valid": False, "error": "Empty expression"})
                    continue

                substituted = re.sub(CONTEXT_STRING_VALUE_PATTERN, "__visivo_ctx__", expression)
                try:
                    sqlglot.parse_one(
                        f"SELECT {substituted} FROM __placeholder__",
                        read=read_dialect or "duckdb",
                    )
                    results.append({"name": name, "valid": True})
                except Exception as e:
                    # sqlglot decorates messages with ANSI underlines — strip
                    # them; this error renders in the viewer UI.
                    message = re.sub(r"\x1b\[[0-9;]*m", "", str(e))
                    results.append({"name": name, "valid": False, "error": message})

            return jsonify({"results": results}), 200

        except Exception as e:
            Logger.instance().error(f"Expression validation failed: {e}")
            return jsonify({"error": str(e)}), 500
