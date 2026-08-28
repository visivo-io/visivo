import re

from flask import jsonify, request
from visivo.logger.logger import Logger
import sqlglot
from sqlglot import exp
from visivo.query.patterns import CONTEXT_STRING_VALUE_PATTERN
from visivo.query.sqlglot_utils import get_sqlglot_dialect, has_aggregate_function

# ---------------------------------------------------------------------------
# Error sanitisation
#
# Both endpoints below parse a bare EXPRESSION by wrapping it into a throwaway
# statement — `SELECT <expr> FROM __placeholder__` — and `/validate/`
# additionally swaps every `${ref(...)}` context token for an identifier
# sqlglot can read. Those are compiler scaffolding. When the parse fails,
# sqlglot's message quotes the wrapped SQL verbatim, so the user was shown
# `__visivo_ctx__` and `__placeholder__` — tokens that appear nowhere in their
# project and that they cannot act on — plus a "Line 1, Col: N" position
# measured against a statement they never wrote.
#
# `sanitize_expression_error` puts the message back into the user's own words.
# ---------------------------------------------------------------------------

# Sentinel names. `_CTX_TOKEN_TEMPLATE` is numbered so each ref maps back to
# the exact text the author typed rather than to a generic stand-in.
_CTX_TOKEN_TEMPLATE = "__visivo_ctx_{index}__"
_CTX_TOKEN_PATTERN = re.compile(r"__visivo_ctx(?:_\d+)?__")
_PLACEHOLDER_TABLE = "__placeholder__"

_ANSI_PATTERN = re.compile(r"\x1b\[[0-9;]*m")
# sqlglot appends "Line 1, Col: 28." — a position in the WRAPPED statement.
_POSITION_PATTERN = re.compile(r"\s*Line \d+, Col: \d+\.")
# The `FROM __placeholder__` tail. sqlglot's TOKENIZER errors truncate the SQL
# they echo, so the sentinel can arrive clipped ("__placeholder_"); match any
# clipped form, but insist on the leading underscore so a real table called
# `placeholder` is left alone.
_HARNESS_TABLE_PATTERN = re.compile(r"(?:\s+FROM)?\s+_{1,2}placeholder_{0,2}")
# The `SELECT ` head, at the start of an echoed line or just inside the quotes
# of an "Error tokenizing '...'" message. An expression that legitimately began
# with SELECT would lose that word from the echo — acceptable, because these
# endpoints parse EXPRESSIONS, where a leading SELECT is already an error.
_HARNESS_SELECT_PATTERN = re.compile(r"(?m)(^[ \t]*|['\"])SELECT\s+")


def substitute_context_tokens(expression: str):
    """Swap each `${...}` context token for a unique parseable identifier.

    Returns ``(substituted_sql, {token: original_text})``. The tokens are
    numbered rather than sharing one name so
    :func:`sanitize_expression_error` can restore the author's exact text.
    """
    mapping = {}

    def _replace(match):
        token = _CTX_TOKEN_TEMPLATE.format(index=len(mapping))
        mapping[token] = match.group(0)
        return token

    return re.sub(CONTEXT_STRING_VALUE_PATTERN, _replace, expression), mapping


def sanitize_expression_error(error, token_map=None) -> str:
    """Rewrite a sqlglot parse failure into a message about the user's text.

    Strips ANSI decoration, substitutes every context token back to the ref the
    author wrote, removes the `SELECT ... FROM __placeholder__` harness, and
    drops the position marker (it counts characters in the wrapped statement,
    not in the expression the user typed).
    """
    message = _ANSI_PATTERN.sub("", str(error))

    for token, original in (token_map or {}).items():
        message = message.replace(token, original)
    # Anything the map missed still must not escape.
    message = _CTX_TOKEN_PATTERN.sub("…", message)

    message = _HARNESS_TABLE_PATTERN.sub("", message)
    message = _HARNESS_SELECT_PATTERN.sub(r"\1", message)
    message = _POSITION_PATTERN.sub("", message)

    return "\n".join(line.rstrip() for line in message.split("\n")).strip()


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
                    wrapped_sql = f"SELECT {expression} FROM {_PLACEHOLDER_TABLE}"
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
                            # Same rule as /validate/: the message reaches the
                            # UI, so it may not carry the `__placeholder__`
                            # harness this endpoint wrapped the expression in.
                            "error": sanitize_expression_error(e),
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

                substituted, token_map = substitute_context_tokens(expression)
                try:
                    sqlglot.parse_one(
                        f"SELECT {substituted} FROM {_PLACEHOLDER_TABLE}",
                        read=read_dialect or "duckdb",
                    )
                    results.append({"name": name, "valid": True})
                except Exception as e:
                    # This error renders in the viewer UI, so it must talk about
                    # the expression the author wrote — not about the harness
                    # that wrapped it (M13).
                    message = sanitize_expression_error(e, token_map)
                    results.append({"name": name, "valid": False, "error": message})

            return jsonify({"results": results}), 200

        except Exception as e:
            Logger.instance().error(f"Expression validation failed: {e}")
            return jsonify({"error": str(e)}), 500
