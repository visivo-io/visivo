"""Type-aware quoting of input-value placeholders in a query (smoke-test bug #13).

An input filter like ``?{ equipment = ${ref(pick).value} }`` (no surrounding
quotes) resolved to ``... = ${pick.value}`` and the client substituted the raw
selected value, yielding ``equipment = Raw`` — SQL reads ``Raw`` as a *column*,
so it silently failed / returned wrong rows. Quoting the value unconditionally
is wrong too: it would break a legitimate numeric ``age = ${pick.value}`` and
double-quote an already-quoted ``= '${pick.value}'`` (the established pattern).

The deciding factor is a FACT, not a text-context guess: the value's TYPE, which
the runner already knows (the input's option types / the compared column's type
from the model schema the source job produced). This module wraps a placeholder
in single quotes ONLY when it should be a string literal AND it is not already
inside one — determined structurally with SQLGlot (per the repo's "validate SQL
with SQLGlot, never regex" rule; the regex here only locates the Visivo
``${input.accessor}`` DSL, never SQL structure). On any SQLGlot parse failure it
returns the SQL unchanged — it must never corrupt a query it can't analyze.
"""

import re
from typing import Callable

# Locates the (already-resolved) frontend placeholder form ``${input.accessor}``.
_PLACEHOLDER = re.compile(r"\$\{\s*([\w-]+)\s*\.\s*([\w-]+)\s*\}")


def quote_bare_string_placeholders(sql: str, should_quote: Callable[[str, str], bool]) -> str:
    """Wrap each ``${input.accessor}`` placeholder in ``sql`` in single quotes
    when ``should_quote(input_name, accessor)`` is True AND the placeholder is
    not already inside a SQL string literal.

    ``should_quote`` is the type decision, supplied by the caller (True iff the
    accessor yields a string value that must be a SQL string literal). Numeric
    values, and accessors that are already a quoted SQL fragment (e.g. a
    multi-select ``.values`` IN-list), pass ``should_quote`` == False and are
    left untouched.
    """
    if not _PLACEHOLDER.search(sql):
        return sql

    # Substitute a unique bare marker for each placeholder so SQLGlot can parse
    # the query and we can locate each placeholder structurally.
    matches = [(m.group(1), m.group(2), m.group(0)) for m in _PLACEHOLDER.finditer(sql)]

    counter = {"i": 0}

    def to_marker(_m):
        i = counter["i"]
        counter["i"] += 1
        return f"__vzph{i}__"

    marked = _PLACEHOLDER.sub(to_marker, sql)

    try:
        import sqlglot
        from sqlglot import exp

        parsed = sqlglot.parse_one(marked, dialect="duckdb")
    except Exception:
        return sql
    if parsed is None:
        return sql

    # A marker that appears inside a string Literal was already quoted by the
    # user (`'${x.value}'` or embedded in a larger string) — leave it alone.
    quoted_markers = set()
    for literal in parsed.find_all(exp.Literal):
        if getattr(literal, "is_string", False):
            content = str(literal.this)
            for i in range(len(matches)):
                if f"__vzph{i}__" in content:
                    quoted_markers.add(i)

    rebuild = {"i": 0}

    def rewrite(_m):
        i = rebuild["i"]
        rebuild["i"] += 1
        input_name, accessor, original = matches[i]
        already_quoted = i in quoted_markers
        if not already_quoted and should_quote(input_name, accessor):
            return f"'{original}'"
        return original

    return _PLACEHOLDER.sub(rewrite, sql)
