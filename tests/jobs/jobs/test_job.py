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
    # Clear verbose environment variable to ensure consistent test behavior
    if "DEBUG" in os.environ:
        del os.environ["DEBUG"]

    details = "Testing Details"
    full_path = temp_file("test.duckdb", "file")

    message = format_message_success(details=details, start_time=time(), full_path=full_path)
    assert "database file: tmp" in message
    assert "Testing Details" in message
    assert "[SUCCESS" in message
    # Check that dots are present for alignment
    assert "..." in message or ".." in message
    assert "SUCCESS" in message


def test_runner_message_failure():
    # Clear verbose environment variable to ensure consistent test behavior
    if "DEBUG" in os.environ:
        del os.environ["DEBUG"]

    details = "Testing Details"
    full_path = temp_file("test.sql", "file")
    error_msg = "You did something wrong."

    message = format_message_failure(
        details=details, start_time=time(), full_path=full_path, error_msg=error_msg
    )
    assert "query: tmp" in message
    assert "Testing Details" in message
    assert "[FAILURE" in message
    # Check that dots are present for alignment
    assert "..." in message or ".." in message
    assert "FAILURE" in message
    assert "error: You did something wrong." in message


def test_runner_message_verbose():
    """Test that verbose mode shows full details without truncation"""
    # Set verbose environment variable
    os.environ["DEBUG"] = "true"

    try:
        long_details = "This is a really really really long trace name that would normally be truncated but should show fully in verbose mode"
        full_path = temp_file("test.duckdb", "file")

        message = format_message_success(
            details=long_details, start_time=time(), full_path=full_path
        )

        # In verbose mode, the full details should be present
        assert long_details in message
        assert "[SUCCESS" in message

        # Test with failure message too
        message = format_message_failure(
            details=long_details, start_time=time(), full_path=full_path, error_msg="Test error"
        )
        assert long_details in message
        assert "[FAILURE" in message

    finally:
        # Clean up environment variable
        if "DEBUG" in os.environ:
            del os.environ["DEBUG"]


def test_runner_message_truncation():
    """Test that non-verbose mode truncates long details"""
    # Ensure verbose mode is off
    if "DEBUG" in os.environ:
        del os.environ["DEBUG"]

    long_details = "This is a really really really long trace name that should definitely be truncated in normal mode because it exceeds the width limit"
    full_path = temp_file("test.sql", "file")

    message = format_message_success(details=long_details, start_time=time(), full_path=full_path)

    # In normal mode, details should be truncated and show (trunc) placeholder
    assert "(trunc)" in message
    assert "[SUCCESS" in message
    # The full long details should NOT be in the message
    assert long_details not in message


def test_cached_future():
    item = "Test Item"
    message = "Test Message"

    cached_future = CachedFuture(item=item, message=message)
    assert cached_future.done()
    assert cached_future.result().success
