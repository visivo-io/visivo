"""Tests for the time-to-value journey ledger (Guided First Run W1).

What they pin: a mark fires exactly once per journey rather than once per
session; every mark carries the properties required by
specs/marketing-relaunch/event-taxonomy.md §4; the opt-out suppresses
everything and leaves no ledger file behind; and no payload or ledger holds a
user-authored string. Every test isolates HOME so the real ~/.visivo is
never touched.
"""

import json
import os
import time
import uuid

import pytest

from visivo.telemetry import first_run


@pytest.fixture(autouse=True)
def isolated_home(tmp_path, monkeypatch):
    """Point ~ at a tmp dir so the ledger never lands in the real home.

    Also stands in for "a human is at a terminal": a journey is only MINTED on
    an interactive run, and pytest captures stdout so the real check is False
    here. The suppression itself is pinned by TestNotAFirstRun below.
    """
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.delenv("VISIVO_TELEMETRY_DISABLED", raising=False)
    monkeypatch.setattr("visivo.telemetry.first_run._is_interactive_run", lambda: True)
    first_run.reset_journey_cache()
    yield tmp_path
    first_run.reset_journey_cache()


class RecordingClient:
    """Stand-in for the PostHog client that records the events it is handed."""

    def __init__(self):
        self.events = []

    def track(self, event):
        self.events.append(event)


@pytest.fixture
def recording_client(monkeypatch):
    client = RecordingClient()
    monkeypatch.setattr(
        "visivo.telemetry.client.get_telemetry_client",
        lambda enabled=True: client,
    )
    return client


class TestJourneyLedger:
    def test_creates_a_journey_with_a_random_id_and_a_start(self, isolated_home):
        journey = first_run.get_or_create_journey()

        assert journey is not None
        uuid.UUID(journey["journey_id"])  # random UUID, not derived from anything
        assert isinstance(journey["started_at_ms"], int)
        assert journey["steps"] == {}
        assert first_run.ledger_path().exists()

    def test_journey_is_stable_across_calls(self):
        first = first_run.get_or_create_journey()
        second = first_run.get_or_create_journey()

        assert first["journey_id"] == second["journey_id"]
        assert first["started_at_ms"] == second["started_at_ms"]

    def test_corrupt_ledger_is_treated_as_absent_not_raised(self, isolated_home):
        path = first_run.ledger_path()
        path.parent.mkdir(exist_ok=True)
        path.write_text("{not json at all")

        assert first_run.read_ledger() is None
        # And the caller still gets a usable journey rather than an exception.
        assert first_run.get_or_create_journey() is not None

    def test_ledger_without_a_journey_id_is_rejected(self, isolated_home):
        path = first_run.ledger_path()
        path.parent.mkdir(exist_ok=True)
        path.write_text(json.dumps({"started_at_ms": 1, "steps": {}}))

        assert first_run.read_ledger() is None


class TestMarkStep:
    def test_marks_the_step_once_and_only_once(self, recording_client):
        assert first_run.mark_step(first_run.STEP_FIRST_RUN_LAUNCHED) is True
        assert first_run.mark_step(first_run.STEP_FIRST_RUN_LAUNCHED) is False
        assert first_run.mark_step(first_run.STEP_FIRST_RUN_LAUNCHED) is False

        assert len(recording_client.events) == 1

    def test_idempotence_survives_a_new_process(self, recording_client):
        """The ledger, not in-memory state, is what makes 'once' true."""
        assert first_run.mark_step(first_run.STEP_FIRST_RUN_LAUNCHED) is True

        # Simulate a restart: nothing cached, only the file on disk.
        reread = first_run.read_ledger()
        assert first_run.STEP_FIRST_RUN_LAUNCHED in reread["steps"]
        assert first_run.mark_step(first_run.STEP_FIRST_RUN_LAUNCHED) is False
        assert len(recording_client.events) == 1

    def test_event_carries_every_required_property(self, recording_client):
        first_run.mark_step(first_run.STEP_FIRST_RUN_LAUNCHED)

        event = recording_client.events[0]
        assert event.event_type == "first_run_launched"
        props = event.properties
        uuid.UUID(props["journey_id"])
        assert props["step_id"] == "first_run_launched"
        assert props["step_index"] == 1
        assert isinstance(props["ms_since_first_run"], int)
        assert props["ms_since_first_run"] >= 0
        # First mark of the journey: there is no previous step to measure from.
        assert props["ms_since_previous_step"] is None
        assert props["out_of_order"] is False
        assert props["machine_id"] == event.machine_id
        assert props["surface"] == "cli"
        assert props["plan"] == "anonymous"
        assert "is_ci" in props and "visivo_version" in props and "platform" in props

    def test_step_index_matches_the_frozen_ladder(self):
        assert first_run.STEP_INDEXES == {
            "first_run_launched": 1,
            "source_connected": 2,
            "first_query_run": 3,
            "first_model_created": 4,
            "first_insight_created": 5,
            "first_dashboard_rendered": 6,
        }

    def test_second_step_measures_from_the_previous_one(self, recording_client):
        first_run.mark_step("first_run_launched")
        first_run.mark_step("source_connected")

        second = recording_client.events[1].properties
        assert second["step_index"] == 2
        assert isinstance(second["ms_since_previous_step"], int)
        assert second["ms_since_previous_step"] >= 0
        assert second["out_of_order"] is False

    def test_marks_are_emitted_in_ladder_order(self, recording_client):
        for step in ["first_run_launched", "source_connected", "first_query_run"]:
            first_run.mark_step(step)

        indexes = [event.properties["step_index"] for event in recording_client.events]
        timestamps = [event.properties["ms_since_first_run"] for event in recording_client.events]
        assert indexes == [1, 2, 3]
        assert timestamps == sorted(timestamps)

    def test_a_step_recorded_in_the_future_is_flagged_out_of_order(self, recording_client):
        """A clock jump must show up as data, not as a silently wrong median."""
        journey = first_run.get_or_create_journey()
        journey["steps"] = {"first_run_launched": journey["started_at_ms"] + 10_000_000}
        first_run._write_ledger(journey)

        assert first_run.mark_step("source_connected") is True
        assert recording_client.events[0].properties["out_of_order"] is True

    def test_unknown_step_is_refused(self, recording_client):
        assert first_run.mark_step("definitely_not_a_step") is False
        assert recording_client.events == []
        # And it is not silently written into the ledger either.
        assert first_run.read_ledger() is None

    def test_a_throwing_client_does_not_re_fire_on_every_call(self, monkeypatch):
        def explode(enabled=True):
            raise RuntimeError("posthog is down")

        monkeypatch.setattr("visivo.telemetry.client.get_telemetry_client", explode)

        assert first_run.mark_step("first_run_launched") is False
        # The step is still claimed: a network failure must not turn into a
        # retry storm that re-fires the mark on every page load.
        assert "first_run_launched" in first_run.read_ledger()["steps"]


class TestOptOut:
    @pytest.fixture(autouse=True)
    def opted_out(self, monkeypatch):
        monkeypatch.setenv("VISIVO_TELEMETRY_DISABLED", "true")

    def test_no_journey_is_created(self):
        assert first_run.get_or_create_journey() is None
        assert not first_run.ledger_path().exists()

    def test_no_step_is_marked_and_nothing_is_written(self, recording_client):
        assert first_run.mark_step("first_run_launched") is False
        assert recording_client.events == []
        assert not first_run.ledger_path().exists()

    def test_no_journey_is_handed_to_the_viewer(self):
        assert first_run.viewer_journey_context() is None
        assert not first_run.ledger_path().exists()

    def test_project_defaults_opt_out_is_honored(self, monkeypatch, recording_client):
        monkeypatch.delenv("VISIVO_TELEMETRY_DISABLED", raising=False)

        class Defaults:
            telemetry_enabled = False

        assert first_run.mark_step("first_run_launched", project_defaults=Defaults()) is False
        assert recording_client.events == []
        assert not first_run.ledger_path().exists()


class TestViewerJourneyContext:
    def test_hands_the_viewer_the_journey_the_cli_started(self, recording_client):
        first_run.mark_step("first_run_launched")

        context = first_run.viewer_journey_context()

        ledger = first_run.read_ledger()
        assert context["journey_id"] == ledger["journey_id"]
        assert context["started_at_ms"] == ledger["started_at_ms"]
        # Timestamps, not just names: the viewer's FIRST mark measures
        # ms_since_previous_step against the CLI's real mark.
        assert context["steps"] == ledger["steps"]
        assert isinstance(context["steps"]["first_run_launched"], int)

    def test_machine_id_is_present_so_the_two_halves_can_be_joined(self):
        context = first_run.viewer_journey_context()
        assert context["machine_id"]

    def test_injected_machine_id_is_the_one_the_event_shipped_under(
        self, recording_client, monkeypatch
    ):
        """Truthy is not enough — it has to be the same id, or nothing joins.

        In CI / container contexts ``get_machine_id()`` returns a fresh
        ``ci-<uuid>`` per call, so reading it again would hand the browser an id
        that matches no event and rotates on every page load.
        """
        monkeypatch.setenv("CI", "true")
        monkeypatch.setattr("visivo.telemetry.events.MACHINE_ID", None)

        first_run.mark_step("first_run_launched")
        event_machine_id = recording_client.events[0].properties["machine_id"]

        first_context = first_run.viewer_journey_context()
        second_context = first_run.viewer_journey_context()

        assert first_context["machine_id"] == event_machine_id
        assert second_context["machine_id"] == event_machine_id

    def test_sample_dashboards_are_handed_over_so_from_sample_is_about_the_dashboard(self):
        context = first_run.viewer_journey_context()

        # Read off visivo/templates/samples, not off the onboarding branch taken.
        assert "College Football" in context["sample_dashboards"]
        assert "EV Sales" in context["sample_dashboards"]
        assert "GitHub Releases" in context["sample_dashboards"]

    def test_install_age_reaches_the_viewer_too(self, isolated_home):
        """Viewer marks carry it as well, or only step 1 is filterable."""
        visivo_dir = isolated_home / ".visivo"
        visivo_dir.mkdir(exist_ok=True)
        (visivo_dir / "machine_id").write_text(str(uuid.uuid4()))
        aged = time.time() - 90 * 86400
        os.utime(visivo_dir / "machine_id", (aged, aged))

        context = first_run.viewer_journey_context()

        assert context["install_age_ms"] > 60 * 86400 * 1000


class TestNotAFirstRun:
    """The two ways a journey gets minted for something that is not a first run."""

    def test_an_established_install_is_reported_as_one(self, recording_client, isolated_home):
        """The ledger's absence cannot mean "new" — no install has one yet.

        On rollout day every existing machine has a machine_id months old and
        no first_run.json, so it mints a journey and reaches
        first_dashboard_rendered seconds later. ``install_age_ms`` is what lets
        the gate metric tell that apart from a 2-second time-to-value.
        """
        visivo_dir = isolated_home / ".visivo"
        visivo_dir.mkdir(exist_ok=True)
        (visivo_dir / "machine_id").write_text(str(uuid.uuid4()))
        a_year_ago = time.time() - 365 * 86400
        os.utime(visivo_dir / "machine_id", (a_year_ago, a_year_ago))

        assert first_run.mark_step("first_run_launched") is True

        install_age_ms = recording_client.events[0].properties["install_age_ms"]
        assert install_age_ms > 300 * 86400 * 1000, "an upgrade must not look like a first run"

    def test_a_genuinely_new_install_reports_a_young_one(self, recording_client, isolated_home):
        visivo_dir = isolated_home / ".visivo"
        visivo_dir.mkdir(exist_ok=True)
        (visivo_dir / "machine_id").write_text(str(uuid.uuid4()))

        assert first_run.mark_step("first_run_launched") is True

        install_age_ms = recording_client.events[0].properties["install_age_ms"]
        assert 0 <= install_age_ms < 60_000

    def test_install_age_is_null_when_there_is_no_persisted_machine_id(
        self, recording_client, monkeypatch
    ):
        """CI never persists a machine id, so the install has no knowable age."""
        monkeypatch.setenv("CI", "true")
        monkeypatch.setattr("visivo.telemetry.events.MACHINE_ID", None)

        assert first_run.mark_step("first_run_launched") is True
        assert recording_client.events[0].properties["install_age_ms"] is None

    def test_a_brand_new_install_created_by_this_very_run_is_not_unknown(
        self, recording_client, monkeypatch, isolated_home
    ):
        """`visivo serve` as the literal first command must still report ~0.

        The machine id file is created during this same request, so reading the
        mtime without resolving it first would report `null` — "unknown" — for
        the one cohort the gate metric is entirely about.
        """
        monkeypatch.delenv("CI", raising=False)
        monkeypatch.setattr("visivo.telemetry.events.MACHINE_ID", None)
        monkeypatch.setattr("visivo.telemetry.machine_id._is_interactive", lambda: False)
        assert not (isolated_home / ".visivo" / "machine_id").exists()

        assert first_run.mark_step("first_run_launched") is True

        install_age_ms = recording_client.events[0].properties["install_age_ms"]
        assert install_age_ms is not None and install_age_ms < 60_000

    def test_a_non_interactive_run_mints_no_journey_at_all(self, recording_client, monkeypatch):
        """A container with a fresh $HOME per cold start is not a first run.

        Same backstop `new_installation` already uses (machine_id.py) — it needs
        no platform-specific signal, so Cloud Run / Lambda / a K8s pod / any CI
        runner cannot report a brand-new first run on every start.
        """
        monkeypatch.setattr("visivo.telemetry.first_run._is_interactive_run", lambda: False)

        assert first_run.get_or_create_journey() is None
        assert first_run.mark_step("first_run_launched") is False
        assert first_run.viewer_journey_context() is None
        assert recording_client.events == []
        assert not first_run.ledger_path().exists()

    def test_an_existing_journey_still_marks_on_a_non_interactive_run(
        self, recording_client, monkeypatch
    ):
        """Only MINTING is gated — a user who started at a terminal is still measured."""
        first_run.get_or_create_journey()
        first_run.reset_journey_cache()
        monkeypatch.setattr("visivo.telemetry.first_run._is_interactive_run", lambda: False)

        assert first_run.mark_step("first_run_launched") is True
        assert len(recording_client.events) == 1


class TestUnwritableLedger:
    """A read-only / unwritable $HOME must not multiply journeys."""

    @pytest.fixture(autouse=True)
    def unwritable(self, monkeypatch):
        monkeypatch.setattr(first_run, "_write_ledger", lambda data: False)

    def test_step_one_does_not_re_fire_on_every_page_load(self, recording_client):
        for _ in range(3):
            first_run.mark_step("first_run_launched")

        assert len(recording_client.events) == 1

    def test_the_injected_journey_id_is_the_one_the_event_carried(self, recording_client):
        first_run.mark_step("first_run_launched")
        context = first_run.viewer_journey_context()

        # Without a per-process journey, mark_step and viewer_journey_context
        # each mint their own id and the CLI/viewer halves never join.
        assert context["journey_id"] == recording_client.events[0].properties["journey_id"]

    def test_the_same_journey_is_handed_to_every_page_load(self):
        first = first_run.viewer_journey_context()
        second = first_run.viewer_journey_context()

        assert first["journey_id"] == second["journey_id"]
        assert first["started_at_ms"] == second["started_at_ms"]


class TestWriteIsAtomic:
    def test_a_failed_write_leaves_the_previous_ledger_intact(self, monkeypatch):
        """A truncating write turns a crash into a SECOND journey.

        `read_ledger` reports an unparseable file as absent, and an absent
        ledger mints a fresh journey_id whose ms_since_first_run restarts from
        zero — one first run silently split in two.
        """
        first_run.mark_step("first_run_launched")
        before = first_run.ledger_path().read_text()

        def explode(*args, **kwargs):
            raise OSError("disk full")

        monkeypatch.setattr("visivo.telemetry.first_run.json.dump", explode)
        assert first_run._write_ledger({"journey_id": "nope", "steps": {}}) is False

        assert first_run.ledger_path().read_text() == before
        assert first_run.read_ledger()["journey_id"] == json.loads(before)["journey_id"]

    def test_no_temp_files_are_left_behind(self, monkeypatch, isolated_home):
        def explode(*args, **kwargs):
            raise OSError("disk full")

        first_run.mark_step("first_run_launched")
        monkeypatch.setattr("visivo.telemetry.first_run.json.dump", explode)
        first_run._write_ledger({"journey_id": "nope", "steps": {}})

        leftovers = list((isolated_home / ".visivo").glob(".first_run.*"))
        assert leftovers == []


class TestRecordViewerStep:
    """The viewer's marks are written back so "once" survives a browser change.

    localStorage is scoped to `http://localhost:<port>`; the ledger is not. A
    second browser, an incognito window, a cleared site-data, or `visivo serve
    -p 8001` would otherwise re-fire every viewer mark under the same
    journey_id.
    """

    def test_a_recorded_mark_comes_back_in_the_injected_journey(self, recording_client):
        journey = first_run.get_or_create_journey()

        assert (
            first_run.record_viewer_step(
                "source_connected", journey_id=journey["journey_id"], at_ms=1_700_000_000_000
            )
            is True
        )

        context = first_run.viewer_journey_context()
        assert context["steps"]["source_connected"] == 1_700_000_000_000
        # And it emits nothing: the browser already sent the event.
        assert recording_client.events == []

    def test_recording_the_same_step_twice_is_a_no_op(self):
        journey = first_run.get_or_create_journey()
        journey_id = journey["journey_id"]

        assert first_run.record_viewer_step("source_connected", journey_id=journey_id) is True
        assert first_run.record_viewer_step("source_connected", journey_id=journey_id) is False

    def test_a_mark_from_another_journey_is_refused(self):
        first_run.get_or_create_journey()

        assert first_run.record_viewer_step("source_connected", journey_id="not-this-one") is False
        assert "source_connected" not in first_run.read_ledger()["steps"]

    def test_an_unknown_step_is_refused(self):
        first_run.get_or_create_journey()

        assert first_run.record_viewer_step("definitely_not_a_step") is False
        assert first_run.read_ledger()["steps"] == {}

    def test_nothing_is_recorded_without_a_journey(self):
        assert first_run.record_viewer_step("source_connected") is False
        assert not first_run.ledger_path().exists()

    def test_the_opt_out_covers_the_write_back_too(self, monkeypatch):
        monkeypatch.setenv("VISIVO_TELEMETRY_DISABLED", "true")

        assert first_run.record_viewer_step("source_connected") is False
        assert not first_run.ledger_path().exists()


class TestNoPii:
    def test_payload_contains_no_user_authored_strings_or_paths(
        self, recording_client, isolated_home
    ):
        first_run.mark_step("first_run_launched")
        first_run.mark_step("source_connected")

        home = str(isolated_home)
        for event in recording_client.events:
            for key, value in event.properties.items():
                assert "@" not in key
                if isinstance(value, str):
                    assert home not in value, f"{key} leaked a filesystem path"
                    assert "@" not in value, f"{key} looks like an email address"
                    assert "/" not in value, f"{key} looks like a path"

    def test_the_ledger_on_disk_holds_only_ids_and_timestamps(self):
        first_run.mark_step("first_run_launched")

        ledger = json.loads(first_run.ledger_path().read_text())
        assert set(ledger.keys()) == {
            "journey_id",
            "started_at_ms",
            "install_age_ms",
            "steps",
        }
        uuid.UUID(ledger["journey_id"])
        assert all(isinstance(value, int) for value in ledger["steps"].values())
        # journey_id is the ONLY string in the file — nothing else may become
        # a place a name or a path can hide.
        assert [key for key, value in ledger.items() if isinstance(value, str)] == ["journey_id"]
        assert all(
            isinstance(key, str) and key in first_run.STEP_INDEXES for key in ledger["steps"]
        )
