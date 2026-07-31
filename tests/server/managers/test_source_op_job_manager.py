"""SourceOpJobManager — the local server's half of the async source-op contract.

Both servers answer 202 + a pollable job for these ops. Cloud has no choice
(the ops run on a warm runner pool whose pods deny all ingress, so there is no
request to hold open); the local server matches so the viewer has one code path
and `visivo serve` exercises the same one production does.
"""

import threading
import time

from visivo.server.managers.preview_run_manager import RunStatus
from visivo.server.managers.source_op_job_manager import SourceOpJobManager


def _await(manager, job_id, timeout=5):
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = manager.get_job(job_id)
        if job.status in (RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED):
            return job
        time.sleep(0.01)
    raise AssertionError(f"job {job_id} never reached a terminal state")


def test_a_completed_op_carries_its_result():
    manager = SourceOpJobManager.instance()
    job_id = manager.start("test_connection", lambda: {"status": "connected"})

    job = _await(manager, job_id)

    assert job.status == RunStatus.COMPLETED
    assert job.result == {"status": "connected"}
    assert job.to_dict()["result"] == {"status": "connected"}


def test_a_raising_op_fails_its_job_rather_than_dying_silently():
    """The op runs on a thread nobody is watching. An exception that escaped it
    would leave the viewer polling a job that never resolves."""
    manager = SourceOpJobManager.instance()

    def _boom():
        raise RuntimeError("could not reach warehouse")

    job = _await(manager, manager.start("test_connection", _boom))

    assert job.status == RunStatus.FAILED
    assert "could not reach warehouse" in job.error
    # A failed job reports no result, so a caller can't mistake absence for one.
    assert "result" not in job.to_dict()


def test_poll_envelope_matches_the_shared_contract():
    """These field names are what let one viewer poll either server. The status
    vocabulary is RunStatus, which core's RunnerJobState mirrors deliberately."""
    manager = SourceOpJobManager.instance()
    envelope = _await(manager, manager.start("sources_metadata", lambda: {"sources": []})).to_dict()

    for field in (
        "job_id",
        "status",
        "progress",
        "progress_message",
        "error",
        "result",
    ):
        assert field in envelope, field
    assert envelope["status"] == "completed"
    assert envelope["progress"] == 1.0


def test_jobs_are_independent():
    manager = SourceOpJobManager.instance()
    first = manager.start("test_connection", lambda: {"n": 1})
    second = manager.start("test_connection", lambda: {"n": 2})

    assert first != second
    assert _await(manager, first).result == {"n": 1}
    assert _await(manager, second).result == {"n": 2}


def test_unknown_job_is_none_not_an_error():
    """The poll view turns this into a 404 rather than a 500."""
    assert SourceOpJobManager.instance().get_job("no-such-job") is None


def test_the_op_does_not_run_on_the_request_thread():
    """The whole point of 202: the caller is not held while the warehouse is
    slow. If start() blocked, this would take the full sleep."""
    manager = SourceOpJobManager.instance()
    released = threading.Event()

    started = time.time()
    job_id = manager.start("test_connection", lambda: released.wait(5) or {"ok": True})
    elapsed = time.time() - started

    assert elapsed < 0.5, "start() blocked on the op"
    assert manager.get_job(job_id).status in (RunStatus.QUEUED, RunStatus.RUNNING)

    released.set()
    assert _await(manager, job_id).status == RunStatus.COMPLETED


def test_manager_is_a_singleton():
    """The poll view resolves the job by id from a fresh handle, so both must
    see the same registry."""
    assert SourceOpJobManager.instance() is SourceOpJobManager()
