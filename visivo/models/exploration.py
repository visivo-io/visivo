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
    Home cards. Unlike ``return_to`` this never clears."""

    type: str
    name: str


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
