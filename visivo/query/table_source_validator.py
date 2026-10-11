"""Compile-phase check that a Table's ``columns`` / ``rows`` / ``values`` refs all
read from ONE source (VIS-1462, T7a).

The viewer resolves a column-select / pivot table's data source from the FIRST
``${ref(name).field}`` it finds across ``columns + rows + values``
(``viewer/src/components/items/Table.jsx``) and runs the generated SQL against
that one source's result set. A table that mixes refs to two models (or two
insights) therefore passed compile and silently queried the first source for the
second source's columns — which either errored in the browser ("column not
found") or, worse, rendered the wrong data under the right header.

Until a table can JOIN its referenced models through a declared relationship
(VIS-1467), the honest answer at compile time is: refuse the config and name
every source involved. We only refuse when the referenced sources have NO
relationship: two insights never do (insights are query results, not joinable
models); two models do iff a ``Relation`` path connects them. A related pair is
left alone so that VIS-1467 can light up the join without a config change.
"""

from typing import Dict, List, Optional, Set

import networkx as nx

from visivo.query.patterns import extract_ref_names


def _table_ref_names(table) -> Set[str]:
    names: Set[str] = set()
    for field_list in (table.columns, table.rows, table.values):
        for ref_str in field_list or []:
            names.update(extract_ref_names(ref_str))
    return names


def _model_relation_graph(dag) -> nx.Graph:
    """Undirected graph of model names joined by declared ``Relation`` conditions.

    Built from the raw conditions (``relation.get_referenced_models()``) rather
    than ``RelationGraph`` because the latter resolves every join condition
    through a ``FieldResolver`` — which needs model schemas and an output dir
    that do not exist at compile time. Connectivity is all we need here.
    """
    from visivo.models.dag import all_descendants_of_type
    from visivo.models.models.model import Model
    from visivo.models.relation import Relation

    graph = nx.Graph()
    for model in all_descendants_of_type(type=Model, dag=dag):
        graph.add_node(model.name)
    for relation in all_descendants_of_type(type=Relation, dag=dag):
        referenced = list(relation.get_referenced_models())
        if len(referenced) == 2:
            graph.add_edge(referenced[0], referenced[1])
    return graph


def _sources_are_related(names: List[str], graph: nx.Graph) -> bool:
    """True iff every name is a model node and all of them sit in one connected
    component of the relation graph (i.e. a join path exists between each pair)."""
    if any(name not in graph for name in names):
        return False
    components = nx.node_connected_component(graph, names[0])
    return all(name in components for name in names)


def validate_table_sources(
    name: str,
    ref_names: Set[str],
    insight_names: Set[str],
    relation_graph: nx.Graph,
) -> Optional[str]:
    """Return an actionable error if ``ref_names`` (the sources a table's
    columns/rows/values reference) span more than one UNRELATED source, else
    ``None``."""
    if len(ref_names) <= 1:
        return None

    ordered = sorted(ref_names)
    if any(n in insight_names for n in ordered) or not _sources_are_related(
        ordered, relation_graph
    ):
        quoted = ", ".join(f"'{n}'" for n in ordered)
        return (
            f"Table '{name}' references {len(ordered)} sources with no relationship "
            f"between them: {quoted}. A table's columns, rows and values must all "
            f"read from the same model or insight."
        )
    return None


def validate_project_table_sources(project) -> Optional[str]:
    """Compile-phase check: one actionable error naming every Table whose
    ``columns``/``rows``/``values`` reference more than one unrelated source,
    or ``None`` when every table reads from a single source.

    Runs at COMPILE (not model construction) for the same reason as
    ``validate_project_table_sql``: a broken table must not stop the project
    from LOADING — the server stays up and surfaces this through ``error.json``.
    """
    from visivo.models.dag import all_descendants_of_type
    from visivo.models.insight import Insight
    from visivo.models.table import Table

    dag = project.dag()
    tables = all_descendants_of_type(type=Table, dag=dag)
    if not tables:
        return None

    insight_names = {i.name for i in all_descendants_of_type(type=Insight, dag=dag)}
    relation_graph = _model_relation_graph(dag)

    errors = []
    for table in tables:
        error = validate_table_sources(
            table.name or "(unnamed)", _table_ref_names(table), insight_names, relation_graph
        )
        if error:
            errors.append(error)

    if not errors:
        return None

    bullets = "\n".join(f"  - {e}" for e in errors)
    plural = "table reads" if len(errors) == 1 else "tables read"
    return (
        f"{len(errors)} {plural} from more than one source:\n{bullets}\n\n"
        "To fix: point every `${ref(name).field}` in the table at the same model or "
        "insight — build an insight (or model) that combines the sources first, then "
        "reference only that insight from the table."
    )
