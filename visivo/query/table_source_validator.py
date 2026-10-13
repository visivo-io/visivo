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

from typing import Optional, Set

from visivo.query.relation_graph import RelationGraph


def validate_table_sources(
    name: str, ref_names: Set[str], relations: RelationGraph
) -> Optional[str]:
    """Return an actionable error if ``ref_names`` (the sources a table's
    columns/rows/values reference) span more than one UNRELATED source, else
    ``None``. Only models are nodes of ``relations``, so a ref to an insight (or
    an unknown name) never counts as related."""
    if len(ref_names) <= 1:
        return None

    ordered = sorted(ref_names)
    reachable = relations.get_connected_models(ordered[0])
    if all(n in reachable for n in ordered[1:]):
        return None

    quoted = ", ".join(f"'{n}'" for n in ordered)
    return (
        f"Table '{name}' references {len(ordered)} sources with no relationship "
        f"between them: {quoted}. A table's columns, rows and values must all "
        f"read from the same model or insight."
    )


def validate_project_table_sources(project) -> Optional[str]:
    """Compile-phase check: one actionable error naming every Table whose
    ``columns``/``rows``/``values`` reference more than one unrelated source,
    or ``None`` when every table reads from a single source.

    Runs at COMPILE (not model construction) for the same reason as
    ``validate_project_table_sql``: a broken table must not stop the project
    from LOADING — the server stays up and surfaces this through ``error.json``.
    """
    from visivo.models.dag import all_descendants_of_type
    from visivo.models.table import Table

    dag = project.dag()
    multi_ref = [
        (table, names)
        for table in all_descendants_of_type(type=Table, dag=dag)
        if len(names := table.ref_names()) > 1
    ]
    if not multi_ref:
        return None

    # Connectivity only: no FieldResolver, so no schemas or output dir needed.
    relations = RelationGraph(dag)
    errors = [
        error
        for table, names in multi_ref
        if (error := validate_table_sources(table.name or "(unnamed)", names, relations))
    ]
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
