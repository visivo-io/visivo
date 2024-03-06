import os
from time import time
from visivo.query.jobs.job import format_message_failure, format_message_success


def test_runner_message_success():
    details = "Testing Details"
    full_path = os.getcwd()

    message = format_message_success(
        details=details, start_time=time(), full_path=full_path
    )
    assert "query: ." in message
    assert (
        "Testing Details ..........................................................................[SUCCESS"
        in message
    )
    assert "SUCCESS" in message


def test_runner_message_failure():
    details = "Testing Details"
    full_path = os.getcwd()
    error_msg = "You did something wrong."

    message = format_message_failure(
        details=details, start_time=time(), full_path=full_path, error_msg=error_msg
    )
    assert "query: ." in message
    assert (
        "Testing Details ..........................................................................[FAILURE"
        in message
    )
    assert "FAILURE" in message
    assert "error: You did something wrong." in message
