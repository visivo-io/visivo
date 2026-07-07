"""Per-resource *data* fingerprint — the query-relevant subset of a config.

The run-on-save hook (``server/views/run_views.py``) only wants to (re)build when
an edit changed the DATA a run produces, not when it was presentation-only. The
fingerprint is built so that it changes exactly when a runner job (model /
insight / input) would produce different output.

What counts as data, by ``mode``:

* ``"whole"`` — the SQL/connection/input resources (source, models, input,
  dimension/metric/relation). Any field can be data — ``model.sql``, a connection
  host, a static input option list, none of which are query expressions — so the
  whole config is hashed. Presentation edits to these are rare; over-running is
  the safe direction.
* ``"query"`` — the visualization resources (insight, and the presentation types
  chart/table/markdown/dashboard). Only query expressions matter:
    - ``?{ ... }`` an INLINE query — counts everywhere (an insight prop, or a
      chart layout value that visivo pushes into the insight's query).
    - ``${ ... }`` a ref/accessor — counts ONLY for a data-producing resource
      (an insight's ``${ref(model)}`` is a real upstream dependency); for a
      chart/table it's a *read* of already-built data and is NOT a rebuild.
      Structural refs (a chart's ``insights: ["name"]``) are plain names, never
      ``${}``, so layout/order edits carry no token.
  A "query" resource with no counted leaves fingerprints to ``""`` (no data), so
  a type/color edit that leaves the query untouched needs no run.

Ported from core's ``apps/deploys/services/data_fingerprint.py`` (the two stay in
lockstep). Mirrors visivo's query-string grammar (``visivo/query/patterns.py``):
only ``?{`` and ``${`` mark a value. Deliberately CONSERVATIVE — an
unclassifiable value counts as data, forcing an unnecessary run rather than
skipping a real change.
"""

import hashlib
import json

_DELETED = "__deleted__"


def has_inline_query(value):
    """True if a string carries an inline ``?{ ... }`` query."""
    return isinstance(value, str) and "?{" in value


def is_query_value(value, *, include_refs):
    """True if a string value is data-bearing: an inline ``?{}`` query always, or
    a ``${}`` ref when ``include_refs`` (a data-producing resource's dependency)."""
    if not isinstance(value, str):
        return False
    return "?{" in value or (include_refs and "${" in value)


def _collect_query_leaves(node, path, out, *, include_refs):
    """Walk ``node`` and append ``(path, value)`` for every data-bearing string
    leaf. The path makes the fingerprint position-aware, so swapping
    ``props.x``/``props.y`` queries or flipping an interaction ``filter`` to
    ``split`` (same expression) is detected, while reordering plain-name layout
    items (no query leaves) is not."""
    if isinstance(node, dict):
        for key, value in node.items():
            _collect_query_leaves(value, f"{path}.{key}", out, include_refs=include_refs)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            _collect_query_leaves(value, f"{path}[{index}]", out, include_refs=include_refs)
    elif is_query_value(node, include_refs=include_refs):
        out.append((path, node))


def data_fingerprint(mode, config, *, deleted=False, data_producing=True):
    """SHA-256 of a resource's data-relevant content (or ``""`` for a "query"
    resource with no data leaves). ``data_producing`` types include ``${}`` refs
    (real deps) and fingerprint a deletion to a sentinel so their removal forces a
    rebuild; config-only types ignore ``${}`` reads."""
    if deleted and data_producing:
        payload = _DELETED
    elif mode == "query":
        leaves = []
        _collect_query_leaves(config or {}, "", leaves, include_refs=data_producing)
        if not leaves:
            return ""  # no data content — matches the empty "nothing built" default
        leaves.sort()
        payload = leaves
    else:  # "whole"
        payload = config
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode()).hexdigest()
