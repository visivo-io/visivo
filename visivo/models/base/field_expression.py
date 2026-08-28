"""Shared validation for the SQL expression on a Metric or a Dimension."""


def reject_aliased_expression(expression: str, field_kind: str) -> str:
    """Reject an expression that aliases itself.

    A metric's or dimension's ``name`` IS its alias — the query builder supplies
    it. So an expression like ``gdp as gdp2`` produces ``(gdp as gdp2) AS
    "..."`` once wrapped, which no dialect will parse.

    Nothing caught this before, so the value saved happily and failed much later
    at query-build or profile time, surfacing as a raw parser error quoting
    generated table names the user never wrote:

        Parser Error: syntax error at or near "as" LINE 1: CREATE TABLE
        "dim_derived_1787846540440" AS SELECT (gdp as gdp2) AS "__dimension__"

    Detected with SQLGlot rather than a regex (never parse SQL by hand — see
    CLAUDE.md): an aliased expression parses to a single ``exp.Alias`` node.

    FAILS OPEN. If SQLGlot cannot parse the expression at all we say nothing:
    the dialect here is unknown (the parent model's source decides it), and
    valid-but-exotic SQL must not be blocked by a check that only exists to
    catch one specific, common mistake. A genuine syntax error still surfaces
    where it always did.

    :param expression: the raw expression as authored
    :param field_kind: "metric" or "dimension", for the message
    :returns: the expression, unchanged, when it is acceptable
    :raises ValueError: when the expression aliases itself
    """
    if not expression or not isinstance(expression, str):
        return expression

    # A context string (`${ref(...)}`) is not SQL until it is resolved, so
    # there is nothing meaningful to parse yet.
    if "${" in expression:
        return expression

    try:
        import sqlglot
        from sqlglot import exp

        parsed = sqlglot.parse_one(expression)
    except Exception:
        return expression

    if isinstance(parsed, exp.Alias):
        alias = parsed.alias
        inner = parsed.this.sql()
        raise ValueError(
            f"A {field_kind} expression must not alias itself — the {field_kind}'s "
            f"name is already its alias, so '{expression}' becomes "
            f"'({expression}) AS \"...\"' in the generated query, which is not valid SQL. "
            f"Use '{inner}' as the expression"
            + (f", and name the {field_kind} '{alias}'." if alias else ".")
        )

    return expression
