"""The keys a relation joins on, and what a declared ``cardinality`` and a
declared ``primary_key`` say about which side of the join is unique."""

from typing import Callable, Dict, List, Optional

import sqlglot
from sqlglot import exp

from visivo.query.patterns import replace_refs

MANY_SIDES = {"many_to_one": 0, "one_to_many": 1}


def qualified(model, field):
    return f'"{model}"."{field}"'


def condition_models(condition) -> List[str]:
    """The models a relation condition names, in the order it names them."""
    names: List[str] = []

    def collect(model, field):
        if model not in names:
            names.append(model)
        return ""

    replace_refs(condition, collect)
    return names


def _and_terms(node) -> list:
    """The terms that a condition joins with AND at its top level, left to
    right. An OR or a NOT is one term, so nothing below it is a term."""
    while isinstance(node, exp.Paren):
        node = node.this
    if isinstance(node, exp.And):
        return _and_terms(node.this) + _and_terms(node.expression)
    return [node]


def join_keys(condition) -> Dict[str, List[str]]:
    """``{model: [column, ...]}`` for the equalities in a relation condition
    that compare a column of one model with a column of another. Only an
    equality that every matched row must satisfy counts: a top-level term of
    the condition, or of its AND chain. An equality below an OR or a NOT does
    not limit the rows that match, so it gives no key."""
    try:
        tree = sqlglot.parse_one(
            replace_refs(condition, lambda m, f: qualified(m, f) if f else f'"{m}"')
        )
    except Exception:
        return {}
    keys: Dict[str, List[str]] = {}
    for term in _and_terms(tree):
        if not isinstance(term, exp.EQ):
            continue
        left, right = term.this, term.expression
        if not (isinstance(left, exp.Column) and isinstance(right, exp.Column)):
            continue
        if not left.table or not right.table or left.table == right.table:
            continue
        for column in (left, right):
            if column.name not in keys.setdefault(column.table, []):
                keys[column.table].append(column.name)
    return keys if len(keys) == 2 else {}


def primary_key_columns(model) -> List[str]:
    """The declared ``primary_key`` of ``model`` as a list; empty when none."""
    declared = getattr(model, "primary_key", None)
    if isinstance(declared, str):
        return [declared]
    return list(declared or [])


def joins_on_primary_key(model, columns) -> bool:
    """True when ``columns`` hold every column of ``model``'s primary key, so
    each key value matches at most one row of ``model``."""
    primary_key = {column.casefold() for column in primary_key_columns(model)}
    return bool(primary_key) and primary_key <= {column.casefold() for column in columns}


def cardinality_models(condition) -> List[str]:
    """The models of a relation condition in the order that a ``cardinality``
    reads them: the order of the first equality that joins a column of one model
    to a column of the other. A condition that has no such equality gives the
    order in which it names the models."""
    return list(join_keys(condition)) or condition_models(condition)


def declared_many_side(relation) -> Optional[str]:
    """The model a relation's ``cardinality`` declares as the many side."""
    index = MANY_SIDES.get(getattr(relation, "cardinality", None))
    models = cardinality_models(relation.condition)
    if index is None or len(models) != 2:
        return None
    return models[index]


def declared_unique(relation, model_lookup: Callable) -> Dict[str, Optional[bool]]:
    """``{model: unique}`` for the two sides of ``relation`` from what the
    project declares. The relation's ``cardinality`` comes first, then a join
    on a model's ``primary_key``. ``None`` means nothing is declared."""
    models = cardinality_models(relation.condition)
    if len(models) != 2:
        return {}
    if getattr(relation, "cardinality", None):
        many = declared_many_side(relation)
        return {model: model != many for model in models}
    keys = join_keys(relation.condition)
    return {
        model: True if joins_on_primary_key(model_lookup(model), keys.get(model, [])) else None
        for model in models
    }


def cardinality_error(relation, model_lookup: Callable) -> Optional[str]:
    """Why the ``cardinality`` of ``relation`` disagrees with a declared
    ``primary_key``, or ``None``. ``model_lookup`` gives a model by name."""
    many = declared_many_side(relation)
    if many is None:
        return None
    columns = join_keys(relation.condition).get(many, [])
    model = model_lookup(many)
    if model is None or not joins_on_primary_key(model, columns):
        return None
    one = next(name for name in cardinality_models(relation.condition) if name != many)
    primary_key = ", ".join(primary_key_columns(model))
    return (
        f"Relation '{relation.name}' declares cardinality '{relation.cardinality}', so one "
        f"'{one}' row matches many '{many}' rows. But the condition joins '{many}' on its "
        f"primary_key ({primary_key}), so each key matches one '{many}' row. Change the "
        f"cardinality of the relation, or correct the primary_key of model '{many}'."
    )
