"""A relation joins, and an insight queries, inside ONE source."""

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
    """Reject at compile what can only be built wrong at run.

    ``SingleSourceValidator`` already holds each *metric* and *dimension* to one
    source, but nothing held the two objects that actually generate a join:

    * a **relation** produces a SQL ``JOIN`` between two models, and two
      databases cannot be joined in one statement;
    * an **insight** embeds every dependent model as a CTE in one query and
      hands it to a single ``source.read_sql``.

    Both failed late and badly instead — the driver for whichever source got
    picked complained about a table belonging to the other one, and *which*
    source got picked came out of set iteration order, so the same project could
    blame either half on different runs. The rule to prevent it
    (``Relation.validate_same_source``) was written and tested a long time ago
    and never wired to anything.

    Runs last, after the reference and single-source validators: a broken
    ``${ref()}`` or a metric that already spans sources is the more local,
    more actionable mistake and should be the one the author reads first.
    """

    def validate(self, project: "Project") -> "Project":
        dag = project.dag()

        for relation in all_descendants_of_type(type=Relation, dag=dag):
            error = cross_source_relation_error(relation, dag)
            if error:
                raise error

        for insight in all_descendants_of_type(type=Insight, dag=dag):
            error = cross_source_insight_error(
                insight.name, insight.get_all_dependent_models(dag), dag
            )
            if error:
                raise error

        return project
