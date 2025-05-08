import os
from time import time
from tests.support.utils import temp_file
from visivo.jobs.job import (
    CachedFuture,
    JobResult,
    format_message_failure,
    format_message_success,
)


def test_runner_message_success():
    details = "Testing Details"
    full_path = temp_file("test.duckdb", "file")

    message = format_message_success(details=details, start_time=time(), full_path=full_path)
    assert "database file: tmp" in message
    assert (
        "Testing Details ..........................................................................[SUCCESS"
        in message
    )
    assert "SUCCESS" in message


def test_runner_message_failure():
    details = "Testing Details"
    full_path = temp_file("test.sql", "file")
    error_msg = "You did something wrong."

    message = format_message_failure(
        details=details, start_time=time(), full_path=full_path, error_msg=error_msg
    )
    assert "query: tmp" in message
    assert (
        "Testing Details ..........................................................................[FAILURE"
        in message
    )
    assert "FAILURE" in message
    assert "error: You did something wrong." in message


def test_cached_future():
    item = "Test Item"
    message = "Test Message"

    cached_future = CachedFuture(item=item, message=message)
    assert cached_future.done()
    assert cached_future.result().success
