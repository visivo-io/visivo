"""Tests for the Exploration Pydantic model (Explore 2.0 Phase 1, S3 contract).

Also asserts the model is NOT reachable from ``visivo.models.project`` — the
guarantee that ``generate_project_schema_json`` is a no-op for this file (the
actual regen + git-diff assertion is a manual protocol step; see the PR body).
"""

import json

import pytest
from pydantic import ValidationError

from visivo.models.exploration import (
    Exploration,
    ExplorationDraft,
    ExplorationQueryDraft,
    PromotionRecord,
    ReturnToRef,
    SeedRef,
)
from tests.factories.model_factories import (
    ExplorationDraftFactory,
    ExplorationFactory,
    ExplorationQueryDraftFactory,
    PromotionRecordFactory,
    ReturnToRefFactory,
    SeedRefFactory,
)


class TestExplorationNotInProjectDag:
    def test_project_module_does_not_import_exploration(self):
        import visivo.models.project as project_module

        assert "exploration" not in project_module.__dict__.get("__name__", "").lower()
        # The Exploration symbol must not be reachable off the Project module —
        # if it were, it would show up in the generated project schema.
        assert not hasattr(project_module, "Exploration")

    def test_exploration_module_not_in_project_schema_defs(self):
        from visivo.parsers.schema_generator import generate_schema

        schema = json.loads(generate_schema())
        defs = schema.get("$defs", {})
        assert "Exploration" not in defs
        assert "ExplorationDraft" not in defs


class TestExplorationDefaults:
    def test_draft_defaults_are_empty(self):
        draft = ExplorationDraft()
        assert draft.queries == []
        assert draft.insights == []
        assert draft.chart is None
        assert draft.computed_columns == []

    def test_exploration_draft_defaults_when_omitted(self):
        # draft is required-with-default: omitting it entirely (not passed at
        # all) falls back to an empty ExplorationDraft via default_factory.
        exploration = ExplorationFactory()
        naked = Exploration(
            id="exp_1",
            name="Scratch",
            created_at=exploration.created_at,
            updated_at=exploration.updated_at,
        )
        assert naked.draft == ExplorationDraft()


class TestExplorationSerialization:
    def test_timestamps_serialize_with_z_suffix(self):
        exploration = ExplorationFactory()
        dumped = exploration.model_dump(mode="json")
        assert dumped["created_at"].endswith("Z")
        assert dumped["updated_at"].endswith("Z")
        assert "+00:00" not in dumped["created_at"]

    def test_promotion_record_timestamp_serializes_with_z_suffix(self):
        record = PromotionRecordFactory()
        dumped = record.model_dump(mode="json")
        assert dumped["promoted_at"].endswith("Z")

    def test_round_trip_via_model_validate(self):
        exploration = ExplorationFactory(
            seeded_from=SeedRefFactory(),
            return_to=ReturnToRefFactory(),
            promoted=[PromotionRecordFactory()],
        )
        payload = json.loads(exploration.model_dump_json())
        restored = Exploration.model_validate(payload)
        assert restored == exploration


class TestExplorationDraftLooseValidation:
    """draft.* inner objects (insights/chart/computed_columns) are
    deliberately loosely validated at rest — a draft may be semantically
    invalid pre-promote."""

    def test_insights_accepts_arbitrary_shaped_dicts(self):
        draft = ExplorationDraft(insights=[{"anything": "goes", "nested": {"a": 1}}])
        assert draft.insights == [{"anything": "goes", "nested": {"a": 1}}]

    def test_chart_accepts_arbitrary_shaped_dict(self):
        draft = ExplorationDraft(chart={"not": "a real chart config"})
        assert draft.chart == {"not": "a real chart config"}

    def test_computed_columns_accepts_arbitrary_shaped_dicts(self):
        draft = ExplorationDraft(computed_columns=[{"expression": "?{ 1 + 1 }"}])
        assert draft.computed_columns == [{"expression": "?{ 1 + 1 }"}]

    def test_query_draft_requires_name_and_sql(self):
        with pytest.raises(ValidationError):
            ExplorationQueryDraft(name="q")  # missing sql

    def test_query_draft_source_is_optional(self):
        query = ExplorationQueryDraftFactory(source=None)
        assert query.source is None


class TestSeedRefAndReturnTo:
    def test_seed_ref_shape(self):
        seed = SeedRefFactory()
        assert seed.type == "model"
        assert seed.name == "orders"

    def test_return_to_slot_optional(self):
        return_to = ReturnToRef(dashboard="kpis")
        assert return_to.slot is None
