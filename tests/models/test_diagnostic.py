import pytest
from pydantic import ValidationError

from visivo.models.diagnostic import (
    DIAGNOSTIC_CODES,
    Diagnostic,
    DiagnosticObjectRef,
    DiagnosticPhase,
    DiagnosticRelated,
    DiagnosticSeverity,
)


def test_minimal_diagnostic_round_trips():
    diagnostic = Diagnostic(
        phase=DiagnosticPhase.RUN,
        code="query_execution_failed",
        message="no such table: order_items",
    )
    dumped = diagnostic.model_dump(mode="json", exclude_none=True)
    assert dumped == {
        "severity": "error",
        "phase": "run",
        "code": "query_execution_failed",
        "message": "no such table: order_items",
        "related": [],
    }
    assert Diagnostic.model_validate(dumped) == diagnostic


def test_full_diagnostic_round_trips():
    diagnostic = Diagnostic(
        severity=DiagnosticSeverity.WARNING,
        phase=DiagnosticPhase.COMPILE,
        code="dependency_failed",
        message="Insight 'churn' was skipped",
        object=DiagnosticObjectRef(type="insight", name="churn"),
        field="props.x",
        detail="The schema job for source 'warehouse' failed first.",
        location={"file": "project.visivo.yml", "line": 41},
        hint="Fix the source connection, then re-run.",
        related=[
            DiagnosticRelated(
                message="source-schema job failed",
                object=DiagnosticObjectRef(type="source", name="warehouse"),
            )
        ],
    )
    restored = Diagnostic.model_validate(diagnostic.model_dump(mode="json"))
    assert restored == diagnostic
    assert restored.related[0].object.name == "warehouse"


def test_unregistered_code_is_rejected():
    with pytest.raises(ValidationError, match="Unknown diagnostic code 'made_up'"):
        Diagnostic(phase=DiagnosticPhase.RUN, code="made_up", message="x")


def test_every_registered_code_constructs():
    for code in DIAGNOSTIC_CODES:
        Diagnostic(phase=DiagnosticPhase.RUN, code=code, message="m")


def test_from_exception_keeps_the_headline_to_one_line():
    exc = Exception("first line of failure\nTraceback (most recent call last):\n  boom")
    diagnostic = Diagnostic.from_exception(exc, phase=DiagnosticPhase.RUN)
    assert diagnostic.message == "first line of failure"
    assert "Traceback" in diagnostic.detail
    assert diagnostic.code == "unexpected_error"
    assert diagnostic.severity == DiagnosticSeverity.ERROR


def test_from_exception_with_empty_text_uses_the_class_name():
    diagnostic = Diagnostic.from_exception(ValueError(), phase=DiagnosticPhase.PARSE)
    assert diagnostic.message == "ValueError"
    assert diagnostic.detail is None


def test_from_exception_carries_code_object_and_hint():
    diagnostic = Diagnostic.from_exception(
        Exception("could not open database"),
        phase=DiagnosticPhase.RUN,
        code="source_locked",
        object=DiagnosticObjectRef(type="source", name="warehouse"),
        hint="Close other connections or restart visivo serve.",
    )
    assert diagnostic.code == "source_locked"
    assert diagnostic.object.name == "warehouse"
    assert diagnostic.hint.startswith("Close other")


def test_extra_keys_are_rejected_everywhere():
    with pytest.raises(ValidationError):
        Diagnostic(phase=DiagnosticPhase.RUN, code="not_built", message="m", extra_key=1)
    with pytest.raises(ValidationError):
        DiagnosticObjectRef(type="model", name="m", other=True)


def test_codes_registry_documents_every_code():
    assert all(isinstance(desc, str) and desc for desc in DIAGNOSTIC_CODES.values())
