"""The Diagnostic contract — one shape for every failure, from job to field.

This is the interface the Error Legibility & Diagnostics initiative ships
FIRST, deliberately with no behaviour change: a single structured description
of "something went wrong" that every producer (parse errors, job failures,
skipped jobs, commit validation) and every consumer (the viewer's diagnostics
panel, run polling, the 422 commit payload, advisory channels) agree on before
any of them are rewritten against it.

The shape is the intersection of three things that already exist:

* LSP's ``Diagnostic`` (severity / message / a location / related information),
  so editor-grade tooling can consume it later without translation;
* the viewer's client-side validation gate errors ``{path, message, keyword}``
  (``validateAgainstSchema.js``);
* ``JobResult``'s ``{error_type, error_models}`` structured metadata.

Wire compatibility is additive by design: ``error_json`` keeps ``phase`` and
grows a ``diagnostics`` key; ``error.json`` keeps ``message``. Consumers keep
their existing fallbacks for payloads that predate the contract.

The mirror typedef for viewer code lives at ``viewer/src/types/diagnostic.js``.
Keep the two in sync — the shape is the contract.
"""

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DiagnosticSeverity(str, Enum):
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"
    HINT = "hint"


class DiagnosticPhase(str, Enum):
    """Which stage of the pipeline produced the diagnostic."""

    PARSE = "parse"
    COMPILE = "compile"
    RUN = "run"
    SERVE = "serve"
    SAVE = "save"
    COMMIT = "commit"
    DEPLOY = "deploy"


# The stable code vocabulary. Codes are the machine-readable half of the
# contract — consumers branch on them, so they are append-only: never rename
# or remove one that has shipped. Add new codes here with a one-line
# description of exactly when a producer may use them.
DIAGNOSTIC_CODES = {
    # Validation / parse
    "extra_forbidden": "A config key the object's schema does not allow.",
    "missing_field": "A required config field is absent.",
    "invalid_value": "A field is present but its value fails validation.",
    "broken_reference": "A ${ref(...)} names an object that does not exist.",
    "expression_parse_failed": "A query-string/context-string expression failed to parse.",
    "yaml_parse_failed": "The YAML file itself did not parse (before any schema validation).",
    # Sources
    "source_locked": "The database file is held by another connection/process.",
    "source_connection_failed": "The source is unreachable or refused the connection.",
    # Jobs / runs
    "dependency_failed": "The job was skipped because something it depends on failed.",
    "missing_model": "The object references no model, so there is nothing to run it against.",
    "missing_relation": "An insight joins models with no relation declared between them.",
    "ambiguous_relation": "More than one relation path exists between the joined models.",
    "query_execution_failed": "The source raised an error executing the job's query.",
    "schema_build_failed": "Schema inference for a model failed.",
    "not_built": "The artifact has never been produced (empty state, not an error).",
    # Commit
    "commit_validation_failed": "The candidate project failed validation before write.",
    # Catch-all — producers should map to something narrower whenever they can.
    "unexpected_error": "An unclassified failure; detail carries the original error.",
}


class DiagnosticObjectRef(BaseModel):
    """The project object a diagnostic is about."""

    model_config = ConfigDict(extra="forbid")

    type: str = Field(description="Object type, e.g. 'model', 'insight', 'source'.")
    name: str = Field(description="The object's name.")


class DiagnosticLocation(BaseModel):
    """Where in the project files the diagnostic anchors."""

    model_config = ConfigDict(extra="forbid")

    file: str = Field(description="Path to the file, as the project references it.")
    line: Optional[int] = Field(None, description="1-indexed line number when known.")


class DiagnosticRelated(BaseModel):
    """A related object or location — e.g. the failed dependency behind a
    dependency_failed diagnostic."""

    model_config = ConfigDict(extra="forbid")

    message: str
    object: Optional[DiagnosticObjectRef] = None
    location: Optional[DiagnosticLocation] = None


class Diagnostic(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Optional[str] = Field(
        None,
        description=(
            "Stable identity for this diagnostic across polls/refetches — consumers "
            "dedup and remember dismissals by it. Producers should derive it from "
            "stable inputs (e.g. phase:code:object:field), never randomize per emit."
        ),
    )
    severity: DiagnosticSeverity = DiagnosticSeverity.ERROR
    phase: DiagnosticPhase
    code: str = Field(description="A key from DIAGNOSTIC_CODES.")
    message: str = Field(description="One human-readable sentence. Never a traceback.")
    object: Optional[DiagnosticObjectRef] = Field(
        None, description="The object this is about, when resolvable."
    )
    field: Optional[str] = Field(
        None, description="Dotted path to the failing field within the object's config."
    )
    detail: Optional[str] = Field(
        None, description="Longer context — original error text, never shown as the headline."
    )
    location: Optional[DiagnosticLocation] = None
    hint: Optional[str] = Field(None, description="What the user can do about it.")
    related: List[DiagnosticRelated] = Field(default_factory=list)

    @field_validator("code")
    @classmethod
    def code_must_be_registered(cls, value):
        if value not in DIAGNOSTIC_CODES:
            raise ValueError(
                f"Unknown diagnostic code '{value}'. Register it in "
                f"visivo/models/diagnostic.py DIAGNOSTIC_CODES — the vocabulary is "
                f"append-only and consumers branch on it."
            )
        return value

    @classmethod
    def from_exception(
        cls,
        exc: BaseException,
        *,
        phase: DiagnosticPhase,
        code: str = "unexpected_error",
        object: Optional[DiagnosticObjectRef] = None,
        hint: Optional[str] = None,
        location: Optional[DiagnosticLocation] = None,
        related: Optional[List[DiagnosticRelated]] = None,
    ) -> "Diagnostic":
        """Wrap an exception without leaking a traceback into the headline.

        The first line of the exception text becomes the message; the full
        text (when longer) is preserved in detail.
        """
        text = str(exc).strip() or exc.__class__.__name__
        first_line = text.splitlines()[0]
        # A factory built to run inside except blocks must never raise and
        # mask the original failure — an unregistered code degrades to
        # unexpected_error with the intended code preserved in detail.
        if code not in DIAGNOSTIC_CODES:
            return cls(
                phase=phase,
                code="unexpected_error",
                message=first_line,
                detail=f"(unregistered diagnostic code '{code}')\n{text}",
                object=object,
                hint=hint,
                location=location,
                related=related or [],
            )
        return cls(
            phase=phase,
            code=code,
            message=first_line,
            detail=text if text != first_line else None,
            object=object,
            hint=hint,
            location=location,
            related=related or [],
        )
