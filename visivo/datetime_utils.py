"""
Datetime utilities for Visivo.

This module provides cross-version compatible datetime functions,
specifically for getting the current UTC time.
"""

from datetime import datetime
import sys


def now_utc() -> datetime:
    """
    Get the current UTC datetime.

    This function handles the difference between Python 3.11 and 3.12+
    where the UTC timezone constant was moved.

    Returns:
        datetime: Current UTC datetime
    """
    if sys.version_info >= (3, 12):
        from datetime import UTC

        return datetime.now(UTC)
    else:
        from datetime import timezone

        return datetime.now(timezone.utc)
