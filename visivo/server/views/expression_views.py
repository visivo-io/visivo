import re

from flask import jsonify, request
from visivo.logger.logger import Logger
import sqlglot
from sqlglot import exp
from visivo.query.patterns import CONTEXT_STRING_VALUE_PATTERN
from visivo.query.sqlglot_utils import get_sqlglot_dialect, has_aggregate_function

# ---------------------------------------------------------------------------
# Parsing a bare expression
#
# Both endpoints below are handed an EXPRESSION, not a statement, and sqlglot
# parses an expression directly — `parse_one("SUM(amount)")` is a `Sum` node.
# Earlier versions wrapped it into `SELECT <expr> FROM __placeholder__` and
# `/validate/` swapped every `${ref(...)}` for a `__visivo_ctx_N__` sentinel,
# which put names the user never wrote into every parse error and forced a
# scrubbing pass on the way back out. That pass could not be made correct:
# sqlglot echoes a WINDOW of the SQL, clipped at both ends
#
#   tokens.py:1085   start = max(self._current - 50, 0) ... context = self.sql[start:end]
#   parser.py:1722   start_context = self.sql[max(start - error_message_context, 0):start]
#
# so a sentinel the window cut through arrived as a fragment (`isivo_ctx_0__`)
# that exact replacement missed, and any pattern loose enough to catch it also
# ate the author's own text (`'SELECT foo'` came back as `'foo'`).
#
# So there is no harness to scrub. Nothing is wrapped, and a `${ref(...)}` is
# made parseable by QUOTING it as an identifier — it stays the author's own
# text, spelled the way the dialect spells an identifier. All that is left is
# presentation: drop sqlglot's ANSI underline and its "Line 1, Col: N" (a
# position in a normalised string, not in what the user typed), and re-echo the
# author's expression in place of the clipped window.
# ---------------------------------------------------------------------------

_ANSI_PATTERN = re.compile(r"\x1b\[[0-9;]*m")
# sqlglot appends "Line 1, Col: 28." — a position in the string it parsed, which
# is the expression with its refs quoted, not the expression as typed.
_POSITION_PATTERN = re.compile(r"\s*Line \d+, Col: \d+\.")
# sqlglot's tokenizer failure: the WHOLE message is `Error tokenizing '<window>'`.
_TOKENIZE_ERROR_PATTERN = re.compile(r"^Error tokenizing '.*'\s*$", re.DOTALL)


def quote_context_tokens(expression: str, dialect=None) -> str:
    """Make `${ref(...)}` tokens parseable by quoting them as identifiers.

    `${ref(orders).amount} > 0` becomes `"${ref(orders).amount}" > 0` (or
    backticks, per the dialect). The point is that the substituted text is
    still the author's text: whatever sqlglot quotes back in an error names
    something the user recognises, so there is nothing to scrub afterwards.
    """
    return re.sub(
        CONTEXT_STRING_VALUE_PATTERN,
        lambda match: exp.to_identifier(match.group(0), quoted=True).sql(
            dialect=dialect or "duckdb"
        ),
        expression,
    )


def sanitize_expression_error(error, expression: str) -> str:
    """Render a sqlglot parse failure as a message about the user's own text.

    Strips the ANSI underline and the position marker, and replaces the SQL
    sqlglot echoes back — a window clipped to ±50 characters around the failure
    — with ``expression``, which is both complete and exactly what the author
    typed.
    """
    message = _ANSI_PATTERN.sub("", str(error))
    author_text = expression.strip()

    if _TOKENIZE_ERROR_PATTERN.match(message.strip()):
        # The whole message is one echoed window; nothing else is in it.
        return f"Error tokenizing '{author_text}'"

    # Parser failures read "<description>. Line L, Col: C.\n  <echoed window>".
    head, newline, _echo = message.partition("\n")
    head = _POSITION_PATTERN.sub("", head).strip()
    if not newline:
        return head
    return f"{head}\n  {author_text}" if head else author_text


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
                    # The expression is parsed as an expression — no `SELECT ...
                    # FROM <table>` harness, so nothing the user never wrote can
                    # reach the error message below.
                    parsed = sqlglot.parse_one(expression, read=read_dialect or "duckdb")
                    duckdb_expr = parsed.sql(dialect="duckdb")

                    detected_type = expr_type
                    if has_aggregate_function(parsed):
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
                            # The message reaches the UI, so it quotes what the
                            # author typed rather than sqlglot's clipped window.
                            "error": sanitize_expression_error(e, expression),
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
        quoted as identifiers before parsing — the pattern is the canonical
        templating-token pattern from visivo.query.patterns, not SQL parsing;
        the resulting pure SQL goes to sqlglot.

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

                quoted = quote_context_tokens(expression, read_dialect or "duckdb")
                try:
                    sqlglot.parse_one(quoted, read=read_dialect or "duckdb")
                    results.append({"name": name, "valid": True})
                except Exception as e:
                    # This error renders in the viewer UI, so it must talk about
                    # the expression the author wrote (M13).
                    message = sanitize_expression_error(e, expression)
                    results.append({"name": name, "valid": False, "error": message})

            return jsonify({"results": results}), 200

        except Exception as e:
            Logger.instance().error(f"Expression validation failed: {e}")
            return jsonify({"error": str(e)}), 500
