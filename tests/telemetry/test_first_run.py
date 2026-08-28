"""Tests for the time-to-value journey ledger (Guided First Run W1).

The 2.1 exit gate ("8 of 8 new users build a dashboard in under 20 minutes")
is read off this ladder, so the properties these tests pin are the metric:

  - a mark fires EXACTLY ONCE per journey, not once per session — a mark that
    re-fired on reload would inflate the funnel and destroy the median;
  - every mark carries the required properties from
    specs/marketing-relaunch/event-taxonomy.md §4;
  - the opt-out suppresses everything AND leaves no ledger file behind;
  - no payload and no ledger contains PII or any user-authored string.

Every test isolates HOME so the real ~/.visivo is never touched.
"""

import json
import uuid

import pytest

from visivo.telemetry import first_run


@pytest.fixture(autouse=True)
def isolated_home(tmp_path, monkeypatch):
    """Point ~ at a tmp dir so the ledger never lands in the real home."""
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.delenv("VISIVO_TELEMETRY_DISABLED", raising=False)
    return tmp_path


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
        assert set(ledger.keys()) == {"journey_id", "started_at_ms", "steps"}
        uuid.UUID(ledger["journey_id"])
        assert all(isinstance(value, int) for value in ledger["steps"].values())
