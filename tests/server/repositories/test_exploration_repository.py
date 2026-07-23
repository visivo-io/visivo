"""Tests for ExplorationRepository — the file-backed JSON-document store
under `.visivo/explorations/` (Explore 2.0 Phase 1).

Structural precedent: the removed 2.0-era ``test_exploration_repository.py``
(commits ``00a83329``/``e172d91b``), adapted from a SQLite-backed repo to a
JSON-document one (02-architecture.md §2).
"""

import json
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

import pytest

from visivo.models.exploration import Exploration
from visivo.server.repositories.exploration_repository import ExplorationRepository
from tests.factories.model_factories import (
    ExplorationDraftFactory,
    SeedRefFactory,
    ReturnToRefFactory,
)


@pytest.fixture
def explorations_dir(tmp_path):
    return str(tmp_path / ".visivo" / "explorations")


@pytest.fixture
def repo(explorations_dir):
    return ExplorationRepository(explorations_dir)


class TestMkdirOnFirstUse:
    def test_directory_not_created_on_construction(self, explorations_dir):
        ExplorationRepository(explorations_dir)
        assert not os.path.exists(explorations_dir)

    def test_directory_created_on_first_create(self, repo, explorations_dir):
        assert not os.path.exists(explorations_dir)
        repo.create()
        assert os.path.isdir(explorations_dir)


class TestCreate:
    def test_create_mints_url_safe_id(self, repo):
        exploration = repo.create()
        assert exploration.id.startswith("exp_")
        assert exploration.id.replace("exp_", "").isalnum()

    def test_create_ids_are_unique(self, repo):
        ids = {repo.create().id for _ in range(10)}
        assert len(ids) == 10

    def test_create_writes_one_json_file_per_exploration(self, repo, explorations_dir):
        exploration = repo.create(name="My Exploration")
        path = os.path.join(explorations_dir, f"{exploration.id}.json")
        assert os.path.exists(path)
        with open(path) as f:
            data = json.load(f)
        assert data["name"] == "My Exploration"

    def test_create_defaults_draft_to_empty(self, repo):
        exploration = repo.create()
        assert exploration.draft.queries == []
        assert exploration.draft.insights == []
        assert exploration.draft.chart is None

    def test_create_accepts_seeded_from_and_return_to(self, repo):
        exploration = repo.create(
            seeded_from={"type": "model", "name": "orders"},
            return_to={"dashboard": "kpis", "slot": "r2-i1"},
        )
        assert exploration.seeded_from.type == "model"
        assert exploration.seeded_from.name == "orders"
        assert exploration.return_to.dashboard == "kpis"
        assert exploration.return_to.slot == "r2-i1"

    def test_create_accepts_draft_dict(self, repo):
        draft_dict = json.loads(ExplorationDraftFactory().model_dump_json())
        exploration = repo.create(draft=draft_dict)
        assert exploration.draft.queries[0].name == "orders_q"

    def test_create_sets_created_and_updated_at_equal(self, repo):
        exploration = repo.create()
        assert exploration.created_at == exploration.updated_at

    def test_create_starts_with_no_promotions(self, repo):
        exploration = repo.create()
        assert exploration.promoted == []


class TestDefaultNaming:
    def test_first_exploration_defaults_to_scratch(self, repo):
        exploration = repo.create()
        assert exploration.name == "Scratch"

    def test_second_exploration_defaults_to_exploration_2(self, repo):
        repo.create()
        second = repo.create()
        assert second.name == "Exploration 2"

    def test_third_exploration_defaults_to_exploration_3(self, repo):
        repo.create()
        repo.create()
        third = repo.create()
        assert third.name == "Exploration 3"

    def test_custom_name_is_not_overridden(self, repo):
        exploration = repo.create(name="Churn dig")
        assert exploration.name == "Churn dig"

    def test_default_naming_counts_all_explorations_incl_custom_named(self, repo):
        repo.create(name="Churn dig")
        second = repo.create()
        assert second.name == "Exploration 2"


class TestConcurrentCreate:
    """VIS-1086: a double-click on '+ New exploration' (or a source tile), or
    two browser windows racing a fresh empty project, both hit `create()`
    with no name. `hot_reload_server.py` runs Flask with
    `async_mode="threading"`, so concurrent HTTP requests are real concurrent
    OS threads in one process — this drives that exact concurrency directly
    against the repository (mirrors production threading, not a serialized
    test double) and asserts the `_create_lock` + collision-checked
    `_default_name()` fix actually closes the race, not just narrows it."""

    def test_concurrent_no_name_creates_mint_unique_names(self, repo):
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = [pool.submit(repo.create) for _ in range(8)]
            results = [f.result() for f in as_completed(futures)]

        names = [e.name for e in results]
        assert len(set(names)) == len(names), f"duplicate default names minted: {names}"

    def test_concurrent_no_name_creates_mint_unique_ids(self, repo):
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = [pool.submit(repo.create) for _ in range(8)]
            results = [f.result() for f in as_completed(futures)]

        ids = [e.id for e in results]
        assert len(set(ids)) == len(ids), f"duplicate ids minted: {ids}"

    def test_concurrent_creates_each_persist_a_distinct_file(self, repo, explorations_dir):
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = [pool.submit(repo.create) for _ in range(8)]
            [f.result() for f in as_completed(futures)]

        files = [f for f in os.listdir(explorations_dir) if f.endswith(".json")]
        assert len(files) == 8

    def test_concurrent_mixed_named_and_default_creates_stay_unique(self, repo):
        # A more realistic mix: some requests carry an explicit name (a
        # rename-on-create flow, if one ever exists), most don't.
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = [pool.submit(repo.create) for _ in range(6)]
            futures += [pool.submit(repo.create, name="Explicit") for _ in range(2)]
            results = [f.result() for f in as_completed(futures)]

        names = [e.name for e in results]
        assert names.count("Explicit") == 2  # explicit names are never disambiguated
        default_names = [n for n in names if n != "Explicit"]
        assert len(set(default_names)) == len(default_names), f"duplicates: {default_names}"


class TestGet:
    def test_get_returns_created_exploration(self, repo):
        created = repo.create(name="Get me")
        fetched = repo.get(created.id)
        assert fetched == created

    def test_get_unknown_id_returns_none(self, repo):
        assert repo.get("exp_doesnotexist") is None


class TestList:
    def test_list_empty_repo_returns_empty_list(self, repo):
        assert repo.list() == []

    def test_list_orders_by_updated_at_desc(self, repo):
        first = repo.create(name="First")
        second = repo.create(name="Second")
        # Touch `first` so it becomes the most recently updated.
        repo.update(first.id, {"name": "First (touched)"})

        listed = repo.list()
        assert [e.id for e in listed] == [first.id, second.id]

    def test_list_reflects_current_state_not_stale_cache(self, repo):
        repo.create(name="A")
        repo.create(name="B")
        assert len(repo.list()) == 2


class TestUpdate:
    def test_update_replaces_name(self, repo):
        created = repo.create(name="Old")
        updated = repo.update(created.id, {"name": "New"})
        assert updated.name == "New"

    def test_update_replaces_draft_wholesale(self, repo):
        created = repo.create()
        new_draft = json.loads(ExplorationDraftFactory().model_dump_json())
        updated = repo.update(created.id, {"draft": new_draft})
        assert updated.draft.queries[0].name == "orders_q"

    def test_update_sets_return_to(self, repo):
        created = repo.create()
        updated = repo.update(created.id, {"return_to": {"dashboard": "kpis", "slot": "r1-i1"}})
        assert updated.return_to.dashboard == "kpis"

    def test_update_can_clear_return_to_with_explicit_null(self, repo):
        created = repo.create(return_to={"dashboard": "kpis"})
        updated = repo.update(created.id, {"return_to": None})
        assert updated.return_to is None

    def test_update_omitting_a_mutable_field_leaves_it_unchanged(self, repo):
        created = repo.create(name="Keep me", return_to={"dashboard": "kpis"})
        updated = repo.update(created.id, {"name": "Renamed"})
        assert updated.name == "Renamed"
        assert updated.return_to.dashboard == "kpis"

    def test_update_bumps_updated_at(self, repo):
        created = repo.create()
        updated = repo.update(created.id, {"name": "Bump"})
        assert updated.updated_at >= created.updated_at

    def test_update_unknown_id_returns_none(self, repo):
        assert repo.update("exp_nope", {"name": "x"}) is None

    def test_update_persists_to_disk(self, repo, explorations_dir):
        created = repo.create(name="Old")
        repo.update(created.id, {"name": "Persisted"})
        path = os.path.join(explorations_dir, f"{created.id}.json")
        with open(path) as f:
            assert json.load(f)["name"] == "Persisted"


class TestImmutability:
    """id/created_at/seeded_from/promoted are immutable via the update route —
    a patch containing any of them is silently ignored, not applied."""

    def test_update_ignores_id_in_patch(self, repo):
        created = repo.create()
        updated = repo.update(created.id, {"id": "exp_hijacked", "name": "x"})
        assert updated.id == created.id

    def test_update_ignores_created_at_in_patch(self, repo):
        created = repo.create()
        updated = repo.update(created.id, {"created_at": "2000-01-01T00:00:00Z", "name": "x"})
        assert updated.created_at == created.created_at

    def test_update_ignores_seeded_from_in_patch(self, repo):
        created = repo.create(seeded_from={"type": "model", "name": "orders"})
        updated = repo.update(
            created.id, {"seeded_from": {"type": "model", "name": "hijacked"}, "name": "x"}
        )
        assert updated.seeded_from.name == "orders"

    def test_update_ignores_promoted_in_patch(self, repo):
        created = repo.create()
        updated = repo.update(
            created.id,
            {
                "promoted": [
                    {"type": "metric", "name": "hijacked", "promoted_at": "2000-01-01T00:00:00Z"}
                ],
                "name": "x",
            },
        )
        assert updated.promoted == []


class TestDelete:
    def test_delete_removes_the_record(self, repo):
        created = repo.create()
        assert repo.delete(created.id) is True
        assert repo.get(created.id) is None

    def test_delete_unknown_id_returns_false(self, repo):
        assert repo.delete("exp_nope") is False

    def test_delete_removes_file_from_disk(self, repo, explorations_dir):
        created = repo.create()
        path = os.path.join(explorations_dir, f"{created.id}.json")
        assert os.path.exists(path)
        repo.delete(created.id)
        assert not os.path.exists(path)


class TestConsumeReturnTo:
    def test_consume_nulls_return_to(self, repo):
        created = repo.create(return_to={"dashboard": "kpis", "slot": "r1-i1"})
        consumed = repo.consume_return_to(created.id)
        assert consumed.return_to is None

    def test_consume_persists_the_null(self, repo):
        created = repo.create(return_to={"dashboard": "kpis"})
        repo.consume_return_to(created.id)
        assert repo.get(created.id).return_to is None

    def test_consume_is_idempotent_when_already_null(self, repo):
        created = repo.create()
        assert created.return_to is None
        consumed = repo.consume_return_to(created.id)
        assert consumed is not None
        assert consumed.return_to is None

    def test_consume_unknown_id_returns_none(self, repo):
        assert repo.consume_return_to("exp_nope") is None

    def test_consume_leaves_other_fields_untouched(self, repo):
        created = repo.create(name="Keep", return_to={"dashboard": "kpis"})
        consumed = repo.consume_return_to(created.id)
        assert consumed.name == "Keep"


class TestRecordPromotion:
    """Explore 2.0 Phase 4 — the append-only ``record-promotion`` sub-action
    (07-exploration-api-contract.md). ``promoted[]`` stays immutable via the
    generic ``update`` route (see ``TestImmutability`` above); this is the
    ONLY way to append to it."""

    def test_appends_a_promotion_record(self, repo):
        created = repo.create()
        updated = repo.record_promotion(created.id, "model", "orders_q")
        assert len(updated.promoted) == 1
        assert updated.promoted[0].type == "model"
        assert updated.promoted[0].name == "orders_q"
        assert updated.promoted[0].promoted_at is not None

    def test_appends_rather_than_replaces_on_a_second_call(self, repo):
        created = repo.create()
        repo.record_promotion(created.id, "model", "orders_q")
        updated = repo.record_promotion(created.id, "insight", "churn_by_cohort")
        assert [p.name for p in updated.promoted] == ["orders_q", "churn_by_cohort"]

    def test_re_promoting_the_same_object_appends_a_new_entry_not_a_dedupe(self, repo):
        created = repo.create()
        repo.record_promotion(created.id, "model", "orders_q")
        updated = repo.record_promotion(created.id, "model", "orders_q")
        assert len(updated.promoted) == 2

    def test_persists_to_disk(self, repo):
        created = repo.create()
        repo.record_promotion(created.id, "chart", "churn_chart")
        reloaded = repo.get(created.id)
        assert len(reloaded.promoted) == 1
        assert reloaded.promoted[0].name == "churn_chart"

    def test_bumps_updated_at(self, repo):
        created = repo.create()
        updated = repo.record_promotion(created.id, "model", "orders_q")
        assert updated.updated_at >= created.updated_at

    def test_leaves_other_fields_untouched(self, repo):
        created = repo.create(name="Keep")
        updated = repo.record_promotion(created.id, "model", "orders_q")
        assert updated.name == "Keep"

    def test_unknown_id_returns_none(self, repo):
        assert repo.record_promotion("exp_nope", "model", "orders_q") is None

    def test_not_reachable_via_the_generic_update_route(self, repo):
        """Immutability guarantee, restated from the other direction: even
        after a real promotion, a client can't further mutate `promoted` by
        PUTting it through `update`."""
        created = repo.create()
        repo.record_promotion(created.id, "model", "orders_q")
        updated = repo.update(created.id, {"promoted": [], "name": "x"})
        assert len(updated.promoted) == 1


class TestAtomicWrites:
    def test_write_leaves_no_tmp_files_behind(self, repo, explorations_dir):
        repo.create()
        repo.create()
        leftovers = [f for f in os.listdir(explorations_dir) if f.endswith(".tmp")]
        assert leftovers == []

    def test_failed_write_does_not_corrupt_existing_file(self, repo, explorations_dir, monkeypatch):
        created = repo.create(name="Safe")
        path = os.path.join(explorations_dir, f"{created.id}.json")
        with open(path) as f:
            original_contents = f.read()

        def boom(*args, **kwargs):
            raise OSError("disk full")

        monkeypatch.setattr(os, "replace", boom)
        with pytest.raises(OSError):
            repo.update(created.id, {"name": "Corrupted"})

        with open(path) as f:
            assert f.read() == original_contents
        # No leftover tmp file after the failed write.
        leftovers = [f for f in os.listdir(explorations_dir) if f.endswith(".tmp")]
        assert leftovers == []
