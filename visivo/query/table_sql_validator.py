"""Server-side validation of the SQL a Table's column-select / pivot config
compiles to.

The viewer builds this SQL client-side (``viewer/src/utils/pivotQueryBuilder.js``)
and runs it in DuckDB-WASM, so a malformed table config — a bad column alias, a
broken column expression — otherwise slips past ``visivo run``/``compile``/
``test`` (which exit 0 with an empty ``error.json``) and only fails in the
browser (smoke-test bug #7). Here we REPLICATE the viewer's SQL construction
with placeholder column identifiers (the exact resolved column names don't
affect SQL *syntax*, so a props_mapping is not needed) and parse-check the
result with SQLGlot, per the repo's "validate SQL with SQLGlot, never regex"
rule. The regexes below parse the Visivo ``${ref(...)}`` DSL and the
``expr as alias`` column grammar — the SQL itself is only ever validated by
SQLGlot.

COUPLING INVARIANT (bug #7 review, H1): SQLGlot is a *re-implementation* of
DuckDB's grammar (pinned ``sqlglot>=27.0.0,<28.0.0``) and its parser is stricter
than DuckDB's binder in places. Because a failure here now HARD-BLOCKS project
load, a valid table would become unloadable if a DuckDB(-WASM) syntax/overload
that the pinned SQLGlot cannot *parse* ever appears. The regression matrix in
``tests/query/test_table_sql_validator.py`` asserts the common DuckDB
aggregate/pivot shapes stay accepted so a SQLGlot bump that regresses them is
caught, not shipped.
"""

import re
from typing import List, Optional

# Mirrors viewer/src/utils/refString.js SINGLE_REF_FIELD_PATTERN / REF_FIELD_PATTERN
# — capture the `field` from a ${ref(name).field} DSL reference.
_SINGLE_REF_FIELD = re.compile(r"^\$\{\s*ref\(\s*[^)]+\s*\)\s*\.\s*([^}\s]+)\s*\}$")
_REF_FIELD = re.compile(r"\$\{\s*ref\(\s*[^)]+\s*\)\s*\.\s*([^}\s]+)\s*\}")
# Mirrors pivotRefResolver.js parseColumnAlias: `<expr> as <alias>`.
_COLUMN_ALIAS = re.compile(r"^(.+?)\s+as\s+(.+)$", re.IGNORECASE)


def _strip_surrounding_quotes(alias: str) -> str:
    """Mirror pivotRefResolver.js stripSurroundingQuotes (bug #4): one matching
    surrounding quote pair, since the caller re-quotes the alias itself."""
    if len(alias) >= 2 and alias[0] == alias[-1] and alias[0] in ("'", '"'):
        return alias[1:-1]
    return alias


def _resolve_field_ref(ref_string: str) -> str:
    """${ref(name).field} -> `field` placeholder (props_mapping-free — only the
    SQL shape matters for validation)."""
    match = _SINGLE_REF_FIELD.match(ref_string.strip())
    return match.group(1) if match else ref_string.strip()


def _resolve_value_expression(value_expr: str) -> str:
    """sum(${ref(x).revenue}) -> sum("revenue")."""
    return _REF_FIELD.sub(lambda m: f'"{m.group(1)}"', value_expr)


def _build_column_select_sql(columns: List[str], table_name: str = "t") -> str:
    parts = []
    for col in columns:
        match = _COLUMN_ALIAS.match(col)
        if match:
            ref, alias = match.group(1).strip(), _strip_surrounding_quotes(match.group(2).strip())
        else:
            ref, alias = col, None
        resolved = _resolve_field_ref(ref)
        parts.append(f'"{resolved}" AS "{alias}"' if alias else f'"{resolved}"')
    return f'SELECT {", ".join(parts)} FROM "{table_name}"'


def _build_pivot_sql(columns, rows, values, table_name: str = "t") -> str:
    on_clause = ", ".join(f'"{_resolve_field_ref(c)}"' for c in columns)
    using_clause = ", ".join(_resolve_value_expression(v) for v in values)
    if rows:
        group_by = ", ".join(f'"{_resolve_field_ref(r)}"' for r in rows)
        return (
            f'PIVOT (SELECT * FROM "{table_name}") ON {on_clause} '
            f"USING {using_clause} GROUP BY {group_by}"
        )
    return f'PIVOT (SELECT * FROM "{table_name}") ON {on_clause} USING {using_clause}'


def validate_table_sql(
    name: str,
    columns: Optional[List[str]],
    rows: Optional[List[str]],
    values: Optional[List[str]],
) -> Optional[str]:
    """Return an actionable error message if the table's column-select / pivot
    config compiles to invalid SQL, else ``None``. A plain ``data:`` table (no
    ``columns``) generates no SQL and is skipped."""
    if not columns:
        return None

    import sqlglot

    # Building AND parsing both inside the try: `validate_table_sql` is a public
    # function (also called directly in tests), so a non-str list entry must
    # yield a clean error string rather than a raw exception, even though the
    # Table model's List[str] coercion guarantees strings on the model path.
    try:
        if rows or values:
            sql = _build_pivot_sql(columns, rows or [], values or [], "t")
        else:
            sql = _build_column_select_sql(columns, "t")
        sqlglot.parse_one(sql, dialect="duckdb")
    except Exception as e:
        first_line = (str(e).splitlines() or [str(e)])[0]
        return (
            f"Table '{name}' compiles to invalid SQL from its columns/rows/values "
            f"config: {first_line}"
        )
    return None
