"""Which side of a relation repeats its join key, and which aggregates in an
insight count a repeated row more than once (fan-out).

A relation is a plain join. When one ``accounts`` row matches many
``subscriptions_monthly`` rows, the join repeats the ``accounts`` row once per
match, so a SUM, COUNT or AVG of an ``accounts`` column comes out too high and
nothing fails. The checks here measure the key on each side against the source
and name the aggregates at risk. They warn; they never refuse a write, because
a one-to-many relation is valid and needed.
"""

from dataclasses import dataclass
from typing import Dict, List, Optional

import sqlglot
from sqlglot import exp

from visivo.jobs.run_model_data_job import (
    AGENT_QUERY_TIMEOUT_S,
    QueryTimeout,
    execute_and_get_result,
)
from visivo.query.patterns import replace_refs
from visivo.server.source_resolution import find_model, from_manager, source_for_model

MAX_EXPANSION_DEPTH = 5
_FAN_OUT_AGGREGATES = (exp.Sum, exp.Count, exp.Avg)


@dataclass
class KeyStats:
    keys: int
    rows: int
    most: int

    @property
    def unique(self):
        return self.most <= 1


@dataclass
class Side:
    model: str
    columns: List[str]
    stats: KeyStats


def _qualified(model, field):
    return f'"{model}"."{field}"'


def join_keys(condition) -> Dict[str, List[str]]:
    """``{model: [column, ...]}`` for the equalities in a relation condition
    that compare a column of one model with a column of another."""
    try:
        tree = sqlglot.parse_one(
            replace_refs(condition, lambda m, f: _qualified(m, f) if f else f'"{m}"')
        )
    except Exception:
        return {}
    keys: Dict[str, List[str]] = {}
    for eq in tree.find_all(exp.EQ):
        left, right = eq.this, eq.expression
        if not (isinstance(left, exp.Column) and isinstance(right, exp.Column)):
            continue
        if not left.table or not right.table or left.table == right.table:
            continue
        for column in (left, right):
            if column.name not in keys.setdefault(column.table, []):
                keys[column.table].append(column.name)
    return keys if len(keys) == 2 else {}


def key_stats(app, model_name, columns) -> Optional[KeyStats]:
    """How often each value of ``columns`` repeats in ``model_name``'s rows,
    measured on its source. ``None`` when the model has no SQL or source, the
    query fails, or it times out."""
    model = find_model(app, model_name)
    sql = getattr(model, "sql", None)
    if not isinstance(sql, str) or not sql.strip():
        return None
    source = source_for_model(app, model, app.output_dir)
    if source is None:
        return None
    dialect = source.get_sqlglot_dialect()
    names = [exp.to_identifier(column).sql(dialect=dialect) for column in columns]
    not_null = " AND ".join(f"{name} IS NOT NULL" for name in names)
    probe = (
        "SELECT COUNT(*) AS key_count, SUM(n) AS row_count, MAX(n) AS most FROM "
        f"(SELECT COUNT(*) AS n FROM ({sql.strip().rstrip(';')}) AS t "
        f"WHERE {not_null} GROUP BY {', '.join(names)}) AS g"
    )
    try:
        result = execute_and_get_result(source, probe, max_rows=1, timeout_s=AGENT_QUERY_TIMEOUT_S)
    except (QueryTimeout, Exception):
        return None
    row = {str(k).lower(): v for k, v in ((result.get("rows") or [{}])[0]).items()}
    if not row.get("key_count"):
        return None
    return KeyStats(int(row["key_count"]), int(row["row_count"]), int(row["most"]))


def relation_sides(app, relation) -> Optional[List[Side]]:
    """Both sides of ``relation`` with their key stats, or ``None`` when the
    condition is not a column equality or a side cannot be measured."""
    keys = join_keys(relation.condition)
    if not keys:
        return None
    sides = []
    for model, columns in keys.items():
        stats = key_stats(app, model, columns)
        if stats is None:
            return None
        sides.append(Side(model, columns, stats))
    return sides


def cardinality(sides) -> str:
    """``one_to_one``, ``one_to_many`` (first side unique) or ``many_to_many``."""
    a, b = sides
    if a.stats.unique and b.stats.unique:
        return "one_to_one"
    if a.stats.unique or b.stats.unique:
        return "one_to_many"
    return "many_to_many"


def _key(side):
    return ", ".join(f"{side.model}.{column}" for column in side.columns)


def relation_warning(relation, sides) -> Optional[str]:
    """The fan-out a join through ``relation`` causes, in words, or ``None``
    for a one-to-one relation."""
    kind = cardinality(sides)
    if kind == "one_to_one":
        return None
    if kind == "many_to_many":
        a, b = sides
        return (
            f"Relation `{relation.name}` is many-to-many: neither `{_key(a)}` (up to "
            f"{a.stats.most} rows per key) nor `{_key(b)}` (up to {b.stats.most}) is unique. "
            "Every SUM, COUNT and AVG across this join counts rows more than once. Join on a "
            "key that is unique on one side, or write a model that has one row per key on "
            "one side and relate to it."
        )
    one, many = sorted(sides, key=lambda side: not side.stats.unique)
    average = many.stats.rows / many.stats.keys
    return (
        f"Relation `{relation.name}` is one-to-many: `{_key(one)}` is unique, and one key "
        f"matches up to {many.stats.most} `{many.model}` rows ({average:.1f} on average). A "
        f"query that joins them repeats each `{one.model}` row once per `{many.model}` row, "
        f"so a SUM, COUNT or AVG of any `{one.model}` column across this join is too high. "
        f"Count `{one.model}` with COUNT(DISTINCT {_key(one)}) when a chart groups or "
        f"filters by a `{many.model}` column."
    )


def _relations(app):
    return [obj for obj in app.relation_manager.get_all_objects_list() if obj is not None]


def _named(items, name):
    return next((item for item in items or [] if getattr(item, "name", None) == name), None)


def _metric(app, model_name, field):
    """``(metric, owner model)`` for ``${ref(model_name).field}``, or for
    ``${ref(model_name)}`` naming a metric when ``field`` is ``None``. The
    draft tier wins over a published model's nested metric."""
    name = model_name if field is None else field
    metric = from_manager(app, "metric_manager", name)
    owner = getattr(metric, "_parent_name", None)
    if metric is not None and (field is None or owner == model_name):
        return metric, owner
    models = (
        [find_model(app, model_name)]
        if field is not None
        else app.model_manager.get_all_objects_list()
    )
    for model in models:
        nested = _named(getattr(model, "metrics", None), name)
        if nested is not None:
            return nested, model.name
    return None, None


def _expanded_sql(app, text, model=None, depth=0):
    """``text`` as SQL with every ref a qualified column and every metric
    written out, so an aggregate shows which model's rows it reads."""
    if depth > MAX_EXPANSION_DEPTH:
        raise ValueError("metrics nest too deep")

    def replace(model_name, field):
        metric, owner = _metric(app, model_name, field)
        if metric is not None:
            return f"({_expanded_sql(app, metric.expression, owner, depth + 1)})"
        return _qualified(model_name, field) if field else f'"{model_name}"'

    tree = sqlglot.parse_one(replace_refs(text, replace))
    if model:
        for column in tree.find_all(exp.Column):
            if not column.table:
                column.set("table", exp.to_identifier(model, quoted=True))
    return tree.sql()


def _query_strings(node, path):
    if isinstance(node, dict):
        for key, value in node.items():
            yield from _query_strings(value, f"{path}.{key}" if path else key)
    elif isinstance(node, list):
        for index, value in enumerate(node):
            yield from _query_strings(value, f"{path}[{index}]")
    elif isinstance(node, str) and "?{" in node:
        yield path, node


def _query_body(text):
    start = text.index("?{") + 2
    end = text.rindex("}")
    return text[start:end]


def _tables_in(app, text):
    tree = sqlglot.parse_one(_expanded_sql(app, _query_body(text)))
    return {column.table for column in tree.find_all(exp.Column) if column.table}


def _fanned_aggregates(app, text):
    """``[(function, model)]`` for each SUM, COUNT or AVG in ``text`` that is
    not DISTINCT and reads a model's columns."""
    tree = sqlglot.parse_one(_expanded_sql(app, _query_body(text)))
    found = []
    for node in tree.find_all(*_FAN_OUT_AGGREGATES):
        if isinstance(node.this, (exp.Distinct, exp.Star)):
            continue
        for table in sorted({c.table for c in node.find_all(exp.Column) if c.table}):
            found.append((node.key.upper(), table))
    return list(dict.fromkeys(found))


def insight_fanout_warnings(app, config) -> List[str]:
    """A warning for each prop of ``config`` that aggregates a model's rows
    across a relation where the other side repeats its key."""
    models = set()
    for _, text in _query_strings(config, ""):
        try:
            models |= _tables_in(app, text)
        except Exception:
            continue
    models = {name for name in models if find_model(app, name) is not None}
    if len(models) < 2:
        return []
    repeated_by: Dict[str, tuple] = {}
    for relation in _relations(app):
        if not relation.get_referenced_models() <= models:
            continue
        sides = relation_sides(app, relation)
        if sides is None:
            continue
        for side, other in (sides, sides[::-1]):
            if not other.stats.unique and side.model not in repeated_by:
                repeated_by[side.model] = (relation, side, other)
    if not repeated_by:
        return []
    warnings = []
    for path, text in _query_strings(config.get("props") or {}, "props"):
        try:
            aggregates = _fanned_aggregates(app, text)
        except Exception:
            continue
        for function, model in aggregates:
            if model not in repeated_by:
                continue
            relation, side, other = repeated_by[model]
            warnings.append(
                f"`{path}` takes {function} over `{model}` rows, but this query joins "
                f"`{model}` to `{other.model}` through relation `{relation.name}`, where one "
                f"`{_key(side)}` matches up to {other.stats.most} `{other.model}` rows. Each "
                f"`{model}` row is counted once per match, so the number is too high "
                f"(fan-out). Use COUNT(DISTINCT ${{ref({model}).{side.columns[0]}}}) to count "
                f"`{model}`; for a SUM or AVG, write a model at one row per "
                f"`{_key(side)}` first, or aggregate `{other.model}` to that key."
            )
    return list(dict.fromkeys(warnings))
