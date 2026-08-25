"""Default ordering policy for insight queries (M4).

Insight queries carry no ORDER BY unless the author adds an explicit ``sort``
interaction, so a first-timer's first chart of an ordered dimension renders in
whatever row order the source returns — a tangled web on any line-rendered
chart, and non-deterministic across runs.

The policy lives here, in one module, so the query builder's diff stays small
and the rules are testable in isolation:

* Only line-rendered insights are reordered: ``scatter``/``scattergl`` whose
  ``mode`` is UNSET (Plotly's default mode draws connected lines) or explicitly
  includes ``lines``. Marker-only scatters are point clouds; bars, histograms
  and every other type keep source order — a raw-projection histogram over a
  large model must not pay for a sort it doesn't need.
* An explicit ``sort`` interaction always wins and is never augmented.
* A split insight orders by split first, then x — series stay contiguous and
  each series is x-ordered.
"""

LINE_RENDERED_TYPES = ("scatter", "scattergl")


def renders_as_line(props) -> bool:
    """True when the insight will draw connected lines.

    ``mode`` unset counts as line-rendered: the product never sets ``mode``,
    and Plotly's default scatter mode connects points — the exact case M4's
    unreadable tangle came from.
    """
    if not props:
        return False
    prop_type = getattr(props.type, "value", props.type)
    if prop_type not in LINE_RENDERED_TYPES:
        return False
    mode = getattr(props, "mode", None)
    if mode is None:
        return True
    return "lines" in mode


def default_sort_expressions(unresolved_query_statements) -> list:
    """Unresolved sort expressions for a line-rendered insight with no
    explicit sort: split ascending first, then x ascending."""
    split_statement = next((s for k, s in unresolved_query_statements if k == "split"), None)
    x_statement = next((s for k, s in unresolved_query_statements if k == "props.x"), None)
    expressions = []
    if split_statement:
        expressions.append(f"{split_statement} ASC")
    if x_statement:
        expressions.append(f"{x_statement} ASC")
    return expressions


def post_query_order_clause(alias_hashes) -> str:
    """ORDER BY clause (or '') re-asserting the default order over the
    registered parquet table.

    A bare ``SELECT * FROM "<hash>"`` relies on the scan preserving parquet row
    order, which DuckDB does not guarantee under parallel scans — the sorted
    parquet the pre-query wrote can still render shuffled. Only meaningful when
    the default sort was applied; an explicit sort's order is whatever the
    author asked for and is not re-imposed here.
    """
    aliases = [alias_hashes.get("split"), alias_hashes.get("props.x")]
    aliases = [a for a in aliases if a]
    if not aliases:
        return ""
    return " ORDER BY " + ", ".join(f'"{a}"' for a in aliases)
