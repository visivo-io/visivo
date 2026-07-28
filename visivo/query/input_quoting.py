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

    # Only quote a placeholder that sits in a VALUE-OPERAND position — the RHS
    # of a comparison, an IN-list element, a LIKE pattern, or a BETWEEN bound.
    # A string-typed input used as an IDENTIFIER (a column / group-by / sort
    # picker, a projection, an aggregate target, or the LHS of a comparison) must
    # stay bare — quoting it would turn `SELECT ${col.value}` into the constant
    # 'squat' for every row and break GROUP BY/ORDER BY. Type != syntactic role,
    # so the role is read from the SQLGlot AST, not from the value's type alone.
    comparisons = (exp.EQ, exp.NEQ, exp.GT, exp.GTE, exp.LT, exp.LTE)

    def is_value_operand(col):
        parent = col.parent
        if parent is None:
            return False
        if isinstance(parent, comparisons):
            return parent.expression is col  # RHS only; the LHS is an identifier
        if isinstance(parent, exp.In):
            return col in (parent.args.get("expressions") or [])
        if isinstance(parent, (exp.Like, exp.ILike)):
            return parent.expression is col  # the pattern operand
        if isinstance(parent, exp.Between):
            return col is parent.args.get("low") or col is parent.args.get("high")
        return False

    operand_markers = set()
    for col in parsed.find_all(exp.Column):
        m = re.match(r"^__vzph(\d+)__$", col.name)
        if m and is_value_operand(col):
            operand_markers.add(int(m.group(1)))

    # A marker inside a string Literal was already quoted by the user
    # (`'${x.value}'` or embedded in a larger string) — leave it alone.
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
        if i in operand_markers and i not in quoted_markers and should_quote(input_name, accessor):
            return f"'{original}'"
        return original

    return _PLACEHOLDER.sub(rewrite, sql)


def input_value_type(input_obj) -> str:
    """Classify an input's scalar value type from the input definition — the
    FACT the runner already holds.

    - ``string``: static list ``options`` (the model types these as ``List[str]``,
      so a selected value is always a string that must be a SQL string literal).
    - ``number``: a range-based input (``range`` set) yields numeric values.
    - ``unknown``: query-based options (``options`` is a QueryString, not a list)
      — the type would need the source schema; not classified here, so callers
      leave those placeholders untouched (conservative, never a regression).
    """
    options = getattr(input_obj, "options", None)
    if isinstance(options, list):
        return "string"
    if getattr(input_obj, "range", None) is not None:
        return "number"
    return "unknown"


def build_should_quote(inputs_by_name) -> Callable[[str, str], bool]:
    """Build the ``should_quote(input_name, accessor)`` predicate from a mapping
    of input name -> input object. Quotes a scalar accessor of a string-typed
    input; never the multi-select ``.values`` accessor (already a quoted IN-list)."""
    types = {name: input_value_type(obj) for name, obj in (inputs_by_name or {}).items()}

    def should_quote(input_name: str, accessor: str) -> bool:
        return accessor != "values" and types.get(input_name) == "string"

    return should_quote
