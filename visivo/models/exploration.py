"""Exploration — Explore 2.0 workbench state (S3 wire contract).

Deliberately NOT part of the Project DAG / project YAML: explorations are
scratch workbench state, not committed config. This module must never be
imported by ``visivo.models.project`` or anything it pulls in — that keeps
``generate_project_schema_json`` a no-op for this file (asserted in CI; see
``tests/models/test_exploration.py``).

Mirrors the frozen contract in
``specs/plan/explorer-workspace-unification/07-exploration-api-contract.md``.
Both backends (this Flask model + the Django twin) implement the same shape.

``draft.*`` sub-objects are deliberately loosely typed (``dict``) — a draft is
allowed to be semantically invalid (e.g. an insight config missing required
fields); the promote gate (Phase 4) is where strictness lives. ``queries`` is
the one draft field with a concrete shape (a scratch SQL query chip), which is
still just plain-string typing, not semantic validation.
"""

from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, Field, field_serializer


def _serialize_utc_z(dt: datetime) -> str:
    """ISO-8601 with a ``Z`` suffix (contract sample uses ``Z``, not ``+00:00``)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


class ExplorationQueryDraft(BaseModel):
    """One scratch query — a chip in the SQL editor header."""

    name: str
    sql: str
    source: Optional[str] = None


class ExplorationDraft(BaseModel):
    queries: List[ExplorationQueryDraft] = Field(default_factory=list)
    insights: List[dict] = Field(default_factory=list)
    chart: Optional[dict] = None
    computed_columns: List[dict] = Field(default_factory=list)
    # Explore 2.0 Phase 2 (viewer/src/components/views/workspace/
    # explorationLegacyBridge.js): the legacy `explorerStore.js` working-state
    # shape (multi-model/multi-insight tabs, chart layout, UI prefs) doesn't
    # cleanly round-trip through the four typed fields above — this is
    # exactly the sanctioned escape hatch documented in
    # specs/plan/explorer-workspace-unification/02-architecture.md §5's
    # contract note ("if the legacy shape can't round-trip cleanly through
    # the contract's fields, carry the remainder under a draft key like
    # `legacy_state`"). Opaque to the backend — never read or validated here,
    # just persisted verbatim. A plain (non-`extra=forbid`) BaseModel field,
    # not visivo's `models.base.BaseModel`, so this file stays independent of
    # the project DAG base classes.
    legacy_state: Optional[dict] = None


class PromotionRecord(BaseModel):
    type: str
    name: str
    promoted_at: datetime

    @field_serializer("promoted_at")
    def _serialize_promoted_at(self, dt: datetime) -> str:
        return _serialize_utc_z(dt)


class ReturnToRef(BaseModel):
    """One-shot placement intent — survives park/resume + reload, self-clears
    on consume (see ``consume_return_to``)."""

    dashboard: str
    slot: Optional[str] = None


class SeedRef(BaseModel):
    """Durable provenance — what this exploration was seeded from, shown on
    Home cards. Unlike ``return_to`` this never clears.

    ``content_signature`` (Explore 2.0 Phase 6c-T1, ux-audit.md's "no
    staleness indication after the underlying insight is edited elsewhere"
    finding — existing-objects #8): a stable client-computed hash of the
    seeded object's config AT SEED TIME (see
    ``explorationStaleness.js``'s ``computeSeedContentSignature``). Opaque to
    the backend — never read or validated here, just persisted verbatim so
    a later resume can recompute the CURRENT object's signature and detect
    drift (the source was edited elsewhere since this copy was made), which
    a bare dangling-ref check can never catch on its own.
    """

    type: str
    name: str
    content_signature: Optional[str] = None


class Exploration(BaseModel):
    id: str
    name: str
    created_at: datetime
    updated_at: datetime
    seeded_from: Optional[SeedRef] = None
    return_to: Optional[ReturnToRef] = None
    draft: ExplorationDraft = Field(default_factory=ExplorationDraft)
    promoted: List[PromotionRecord] = Field(default_factory=list)

    @field_serializer("created_at", "updated_at")
    def _serialize_timestamps(self, dt: datetime) -> str:
        return _serialize_utc_z(dt)
