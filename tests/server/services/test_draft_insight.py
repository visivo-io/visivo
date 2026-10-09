"""The failure paths of the shared draft executor (VIS-1417). The happy path
and the 409/422 branches are exercised through the view and the tool."""

from unittest.mock import Mock

import pytest

from visivo.server.services import draft_insight as module
from visivo.server.services.draft_insight import DraftInsightError, execute_draft_insight


def _overlay(insight, monkeypatch):
    monkeypatch.setattr(module, "build_draft_overlay", lambda *a, **k: ("project", "dag", insight))


def test_an_unexpected_overlay_failure_is_a_400(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("overlay exploded")

    monkeypatch.setattr(module, "build_draft_overlay", boom)

    with pytest.raises(DraftInsightError) as refused:
        execute_draft_insight(Mock(), "/tmp", {"name": "x"})
    assert refused.value.status == 400 and "overlay exploded" in refused.value.payload["error"]


def test_a_dependency_walk_failure_is_a_400(monkeypatch):
    insight = Mock()
    insight.get_all_dependent_models.side_effect = ValueError("no such model")
    _overlay(insight, monkeypatch)

    with pytest.raises(DraftInsightError) as refused:
        execute_draft_insight(Mock(), "/tmp", {"name": "x"})
    assert refused.value.status == 400 and "no such model" in str(refused.value)


def test_no_resolvable_source_is_a_400(monkeypatch):
    insight = Mock(name="i")
    insight.get_all_dependent_models.return_value = []
    insight.get_query_info.return_value = Mock(pre_query="SELECT 1")
    insight.get_dependent_source.side_effect = ValueError("no dependent models")
    _overlay(insight, monkeypatch)
    monkeypatch.setattr(module, "build_schema_overrides", lambda dag, schemas: {})

    with pytest.raises(DraftInsightError) as refused:
        execute_draft_insight(Mock(), "/tmp", {"name": "x"})
    assert refused.value.status == 400 and "no dependent models" in str(refused.value)


def test_a_source_execution_failure_is_a_400_with_the_driver_message(monkeypatch):
    insight = Mock()
    insight.get_all_dependent_models.return_value = []
    insight.get_query_info.return_value = Mock(pre_query="SELECT nope")
    insight.get_dependent_source.return_value = Mock()
    _overlay(insight, monkeypatch)
    monkeypatch.setattr(module, "build_schema_overrides", lambda dag, schemas: {})

    def fail(**kwargs):
        raise RuntimeError("no such column: nope")

    monkeypatch.setattr(module, "execute_and_get_result", fail)

    with pytest.raises(DraftInsightError) as refused:
        execute_draft_insight(Mock(), "/tmp", {"name": "x"})
    assert refused.value.status == 400 and "no such column" in refused.value.payload["error"]


def test_a_non_model_not_run_build_failure_is_a_400(monkeypatch):
    insight = Mock()
    insight.get_all_dependent_models.return_value = []
    insight.get_query_info.side_effect = ValueError("bad expression")
    _overlay(insight, monkeypatch)
    monkeypatch.setattr(module, "build_schema_overrides", lambda dag, schemas: {})

    with pytest.raises(DraftInsightError) as refused:
        execute_draft_insight(Mock(), "/tmp", {"name": "x"})
    assert refused.value.status == 400 and refused.value.payload == {"error": "bad expression"}
