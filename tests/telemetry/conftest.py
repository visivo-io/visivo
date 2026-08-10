"""Shared fixtures for telemetry tests."""

import os
import pytest
from visivo.telemetry.config import CI_ENV_VARS


@pytest.fixture(autouse=True)
def neutral_ci_env(monkeypatch):
    """Neutralize the host's CI signals so telemetry tests are deterministic.

    Telemetry branches on ``is_ci_environment()``, which reads the process env —
    and this repo's own CI runs on RWX, which sets ``RWX_RUN_ID``/``RWX_TASK_ID``.
    Without this, the 'regular user' tests (persistent machine id, no ``ci-``
    prefix, ``is_ci=False``) see a CI env on the runner and fail. Clear every CI
    signal by default; a test that wants CI sets one explicitly AFTER this
    fixture, and that ``setenv``/``setattr`` wins.
    """
    for var in CI_ENV_VARS:
        monkeypatch.delenv(var, raising=False)

    # /.dockerenv is the other signal is_ci_environment checks. Force it absent
    # unless a test mocks it, but pass every other path through to the real check.
    real_exists = os.path.exists
    monkeypatch.setattr(
        os.path,
        "exists",
        lambda path, _e=real_exists: False if path == "/.dockerenv" else _e(path),
    )
