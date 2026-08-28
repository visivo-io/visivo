"""Does this ONE STATEMENT live in exactly ONE source?

The rule is about a *lane*, not about an object. Visivo executes an insight two
different ways, and only one of them can be wrong across sources:

* **Static lane** (``pre_query``) — the builder embeds every dependent model as
  a CTE in one statement and hands that statement to a single
  ``source.read_sql``. Two sources means half the CTEs name tables the executing
  database has never heard of. There is no correct query to build, only a wrong
  one.
* **Dynamic lane** (``post_query``, an insight with an ``Input`` descendant, or
  a ``force_dynamic`` draft) — ``pre_query`` is ``None``. ``run_sql_model_job``
  has already materialised EACH model against ITS OWN source into
  ``models/<name>.parquet``, and the DuckDB-dialect ``post_query`` joins those
  parquet files client-side. Cross-source is not a mistake here, it is the
  documented feature (``mkdocs/topics/sources.md``: "you can bring data together
  in a single chart with insights whose models originate from different
  sources"). Refusing it would break projects that run correctly today.

So ``cross_source_insight_error`` takes ``is_dynamic`` and answers ``None`` for
the dynamic lane. The flag is keyword-only and defaults to ``False`` — the
strict single-statement reading — so a caller that has not thought about the
lane gets the conservative answer rather than a silent hole.

A **relation** is a join condition, not an executable thing: whether it can be
compiled depends entirely on which insight consumes it, so the caller
(``CrossSourceValidator``) decides whether a relation is reachable from the
static lane before asking. ``cross_source_relation_error`` stays a pure
predicate over two models.

The rule existed and was never asked. ``Relation.validate_same_source`` was
written, worded well and fully tested, and called by nothing outside its own
tests, so a cross-source relation compiled clean and failed much later as a raw
driver error ("table X does not exist") against whichever source an arbitrary
``list(models)[0]`` pick landed on. That pick is from a *set*, so which half of
the join the user was told about could change between runs of the same project.

Everything here is a pure function over the DAG, with one wording shared by the
compile-time validator, ``InsightQueryBuilder``, ``run_insight_job`` and the
draft-preview endpoint — an author who slips past one gate meets the same
sentence at the next. Names are sorted before they are reported: the message is
part of the contract and must not depend on set iteration order.

``output_dir`` is threaded through only because callers already hold one;
``get_source_for_model`` has never read it.
"""

from typing import Dict, Iterable, List, Optional, Tuple

from visivo.models.diagnostic import (
    Diagnostic,
    DiagnosticObjectRef,
    DiagnosticPhase,
    DiagnosticRelated,
    DiagnosticSeverity,
)

# The wire ``error_type`` a cross-source failure carries. Matches the value the
# draft-preview endpoint has always returned so the viewer keeps one branch.
CROSS_SOURCE_ERROR_TYPE = "multi_source"


class CrossSourceError(ValueError):
    """A relation or insight spans more than one source.

    A ``ValueError`` so every existing ``except ValueError`` around project
    validation keeps working, with three additions:

    * ``message`` — the plain multi-line text. ``run_insight_job``'s error path
      prefers ``e.message`` over ``repr(e)``, so the user reads the sentence
      instead of a quoted exception repr with escaped newlines.
    * ``diagnostic()`` — the structured ``Diagnostic`` for consumers that speak
      the contract.
    * ``error_details()`` — the ``JobResult.error_details`` dict, shaped like
      the join-path failures the preview run status already carries.
    """

    def __init__(
        self,
        message: str,
        *,
        object_type: str,
        object_name: str,
        pairs: Iterable[Tuple[str, str]],
    ):
        super().__init__(message)
        self.message = message
        self.object_type = object_type
        self.object_name = object_name
        # (model_name, source_name), sorted by model name by the builder.
        self.pairs: List[Tuple[str, str]] = list(pairs)
        self.model_names = [model for model, _ in self.pairs]
        self.source_names = sorted({source for _, source in self.pairs})

    def diagnostic(self, phase: DiagnosticPhase = DiagnosticPhase.RUN) -> Diagnostic:
        return Diagnostic(
            id=f"{phase.value}:cross_source:{self.object_type}:{self.object_name}",
            severity=DiagnosticSeverity.ERROR,
            phase=phase,
            code="cross_source",
            message=self.message.splitlines()[0],
            object=DiagnosticObjectRef(type=self.object_type, name=self.object_name),
            detail=self.message,
            hint=(
                f"Point every model this {self.object_type} reaches at one source, "
                "or split the work into one object per source."
            ),
            related=[
                DiagnosticRelated(
                    message=f"Model '{model}' uses source: {source}",
                    object=DiagnosticObjectRef(type="model", name=model),
                )
                for model, source in self.pairs
            ],
        )

    def error_details(self) -> dict:
        return {
            "error_type": CROSS_SOURCE_ERROR_TYPE,
            "error_models": self.model_names,
            "error_sources": self.source_names,
        }


def source_names_by_model(models, dag, output_dir: str = "") -> Dict[str, str]:
    """``{model_name: source_name}`` for every model whose source resolves.

    Models whose source cannot be resolved are omitted rather than reported —
    ``ModelsHaveSourcesValidator`` owns that failure, and guessing here would
    turn a missing source into a bogus cross-source complaint.
    """
    from visivo.jobs.utils import get_source_for_model

    resolved: Dict[str, str] = {}
    for model in models:
        if model is None:
            continue
        source = get_source_for_model(model, dag, output_dir)
        if source is not None and getattr(source, "name", None):
            resolved[model.name] = source.name
    return resolved


def _build(
    *,
    headline: str,
    closing: str,
    object_type: str,
    object_name: str,
    pairs: List[Tuple[str, str]],
) -> CrossSourceError:
    detail_lines = "\n".join(f"  Model '{model}' uses source: {source}" for model, source in pairs)
    return CrossSourceError(
        f"{headline}\n\n{detail_lines}\n\n{closing}",
        object_type=object_type,
        object_name=object_name,
        pairs=pairs,
    )


def cross_source_relation_error(relation, dag, output_dir: str = "") -> Optional[CrossSourceError]:
    """The failure for a relation joining two sources, or ``None``.

    Returns rather than raises so the caller decides: the project validator
    raises it; an advisory pass could report it instead once cross-source
    execution exists. Only the two-model form is checked — ``RelationGraph``
    silently skips any other arity, so complaining about it here would be the
    wrong place to start that argument.
    """
    model_names = sorted(relation.get_referenced_models())
    if len(model_names) != 2:
        return None  # Other validation handles this case.

    models = []
    for name in model_names:
        try:
            models.append(dag.get_descendant_by_name(name))
        except Exception:
            return None  # A broken ref is RelationReferencesValidator's to report.

    resolved = source_names_by_model(models, dag, output_dir)
    if len(resolved) != 2:
        return None
    pairs = sorted(resolved.items())
    if len({source for _, source in pairs}) == 1:
        return None

    return _build(
        headline=f"Relation '{relation.name}' connects models from different sources.",
        closing=(
            "Cross-source relations are not currently supported. "
            "Both models must use the same source."
        ),
        object_type="relation",
        object_name=relation.name,
        pairs=pairs,
    )


def cross_source_insight_error(
    insight_name: str, models, dag, output_dir: str = "", *, is_dynamic: bool = False
) -> Optional[CrossSourceError]:
    """The failure for a STATIC insight whose models span sources, or ``None``.

    The built ``pre_query`` embeds every dependent model's CTE but executes
    against exactly one source, so two sources means one of them is absent at
    execution time — historically surfacing as the *other* source's driver
    complaining about a table it has never heard of.

    ``is_dynamic=True`` (the insight has an ``Input`` descendant, or the caller
    forced the dynamic build) short-circuits to ``None``: that lane has no
    ``pre_query`` at all. Each model was materialised against its own source
    into ``models/<name>.parquet`` and the DuckDB ``post_query`` joins the
    parquet files, so spanning sources there is the documented feature rather
    than a mistake. Keyword-only and defaulted off so the strict, single
    statement reading is what a caller gets by accident.
    """
    if is_dynamic:
        return None

    resolved = source_names_by_model(models, dag, output_dir)
    source_names = sorted(set(resolved.values()))
    if len(source_names) < 2:
        return None

    pairs = sorted(resolved.items())
    return _build(
        headline=(
            f"Insight '{insight_name}' references models from more than one source: "
            f"{', '.join(source_names)}."
        ),
        closing=(
            "Cross-source insights are not currently supported. "
            "Every model an insight references must use the same source."
        ),
        object_type="insight",
        object_name=insight_name,
        pairs=pairs,
    )


def resolve_insight_source(
    insight_name: str, models, dag, output_dir: str = "", *, is_dynamic: bool = False
):
    """The one source a STATIC insight's models resolve to.

    Raises ``CrossSourceError`` when they disagree, so no caller is ever handed
    an arbitrary winner. When they agree the pick walks models in name order
    rather than ``list(a_set)[0]``: the source that comes back is the same
    either way once they agree, but the *model* named by any downstream
    "no source found" message stops changing between runs.

    ``is_dynamic=True`` keeps the deterministic walk and drops the refusal. The
    dynamic lane still wants A source — the builder reads a dialect off it —
    but it never executes ``pre_query`` against it, so which of two legitimately
    different sources answers is immaterial as long as it is the same one every
    run.
    """
    from visivo.jobs.utils import get_source_for_model

    ordered = sorted((m for m in models if m is not None), key=lambda m: m.name)
    if not ordered:
        raise ValueError(f"Insight '{insight_name}' has no dependent models")

    error = cross_source_insight_error(
        insight_name, ordered, dag, output_dir, is_dynamic=is_dynamic
    )
    if error:
        raise error

    for model in ordered:
        source = get_source_for_model(model, dag, output_dir)
        if source is not None:
            return source

    raise ValueError(f"No source found for model '{ordered[0].name}' in insight '{insight_name}'")
