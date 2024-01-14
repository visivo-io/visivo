from datetime import datetime
from visivo.models.test_run import TestRun, TestFailure, TestSuccess


def test_Test_Run_count():
    data = {"target_name": "name"}
    test_run = TestRun(**data)
    assert test_run.count() == 0
    test_run.add_failure(TestFailure(test_id="id", message="message"))
    assert test_run.count() == 1
    test_run.add_success(TestSuccess(test_id="id"))
    assert test_run.count() == 2


def test_Test_Run_duration():
    started_at = datetime(2022, 12, 30, 23, 59, 58)
    finished_at = datetime(2022, 12, 30, 23, 59, 59)
    data = {"target_name": "name", "started_at": started_at, "finished_at": finished_at}
    test_run = TestRun(**data)
    assert test_run.duration() == 1
