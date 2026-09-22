"""A STATIC insight queries, and the joins it compiles run, inside ONE source."""

from visivo.models.validators.base_validator import BaseProjectValidator
from visivo.models.dag import all_descendants_of_type
from visivo.models.insight import Insight
from visivo.models.relation import Relation
from visivo.query.source_scope import (
    cross_source_insight_error,
    cross_source_relation_error,
)
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from visivo.models.project import Project


class CrossSourceValidator(BaseProjectValidator):
    """Reject at compile what can only be built wrong at run — and nothing else.

    ``SingleSourceValidator`` already holds each *metric* and *dimension* to one
    source, but nothing held the object that actually compiles a join into one
    statement: a **static insight** embeds every dependent model as a CTE in one
    query and hands it to a single ``source.read_sql``. It failed late and badly
    instead — the driver for whichever source got picked complained about a
    table belonging to the other one, and *which* source got picked came out of
    set iteration order, so the same project could blame either half on
    different runs.

    What this validator deliberately does NOT reject:

    * a **dynamic insight** (one with an ``Input`` descendant). It has no
      ``pre_query``; each model is materialised against its own source and the
      DuckDB ``post_query`` joins the parquet files client-side. Spanning
      sources there works today and is the documented feature — see
      ``visivo/query/source_scope``'s module docstring.
    * a **relation** in isolation. A relation is a join condition, not an
      executable thing; it is only wrong when a static insight compiles it into
      a single-source statement. A relation reached only by dynamic insights (or
      by no insight at all, which is every relation mid-authoring) is fine, so
      the relation rule is asked only for relations whose two models both land
      inside one static insight's model set — the same scoping
      ``RelationGraph(relevant_models=...)`` uses when it decides which
      relations to resolve. It is asked FIRST so the author reads about the join
      they wrote rather than about the insight that consumed it.

    Runs last, after the reference and single-source validators: a broken
    ``${ref()}`` or a metric that already spans sources is the more local,
    more actionable mistake and should be the one the author reads first.
    """

    def validate(self, project: "Project") -> "Project":
        dag = project.dag()

        static_insights = [
            insight
            for insight in all_descendants_of_type(type=Insight, dag=dag)
            if not insight.is_dynamic(dag)
        ]
        # Per insight, NOT unioned: model A in one insight and model B in
        # another never meet in a single statement, so a relation between them
        # is never compiled by either.
        static_model_name_sets = [
            {model.name for model in insight.get_all_dependent_models(dag) if model is not None}
            for insight in static_insights
        ]

        for relation in all_descendants_of_type(type=Relation, dag=dag):
            referenced = set(relation.get_referenced_models())
            if not any(referenced <= names for names in static_model_name_sets):
                continue
            error = cross_source_relation_error(relation, dag)
            if error:
                raise error

        for insight in static_insights:
            error = cross_source_insight_error(
                insight.name, insight.get_all_dependent_models(dag), dag
            )
            if error:
                raise error

        return project
