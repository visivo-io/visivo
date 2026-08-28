"""A project-level metric/dimension must reference something."""

from visivo.models.validators.base_validator import BaseProjectValidator
from visivo.query.patterns import has_CONTEXT_STRING_REF_PATTERN
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from visivo.models.project import Project


def standalone_field_ref_error(expression: str, kind: str, name: str):
    """The error for a project-level field that references nothing, or None.

    A metric/dimension has to reach a source through a model. The two forms do
    it differently:

    * **nested** in a model — through the nesting itself, so a bare
      ``count(*)`` is fine;
    * **project-level** — only by naming a model in its expression, so an
      expression with no ``${ref()}`` at all can never reach one.

    That second case was reported only by ``SingleSourceValidator``, at the very
    end of parsing the whole project, as "does not tie back to any source" — a
    late, global error about a local, obvious mistake. Worse, the per-object
    save path does not run project validators at all, so the object saved
    happily and the failure appeared at COMMIT, naming something the user had
    just created and could no longer see.

    Kept as a plain function, not a Pydantic validator on the type, because at
    save time nesting is NOT yet known: ``dimension_views`` calls
    ``set_parent_name`` *after* ``save_from_config`` validates, so a validator
    on ``Dimension`` would reject every nested field too. The caller knows which
    form it has; this only encodes the rule.
    """
    if expression and has_CONTEXT_STRING_REF_PATTERN(expression):
        return None
    return (
        f"Project-level {kind} '{name}' must reference at least one model, "
        f"e.g. '${{ref(model_name).column}}'. Only a {kind} defined inside a "
        f"model can omit references, because nesting is what ties it to a source."
    )


class StandaloneFieldRefsValidator(BaseProjectValidator):
    """Every project-level metric/dimension names at least one other object.

    Scoped to the project's OWN ``metrics`` / ``dimensions`` lists — those are
    exactly the un-nested ones. Model-scoped fields live under their model and
    are deliberately not checked here.
    """

    def validate(self, project: "Project") -> "Project":
        for kind, items in (("metric", project.metrics), ("dimension", project.dimensions)):
            for item in items or []:
                expression = getattr(item, "expression", None)
                name = getattr(item, "name", None)
                if expression is None or not name:
                    continue
                error = standalone_field_ref_error(expression, kind, name)
                if error:
                    raise ValueError(error)
        return project
