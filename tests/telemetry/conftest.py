"""Shared fixtures for telemetry tests."""

import os
import pytest
from visivo.telemetry.config import CI_ENV_VARS, CONTAINER_MARKER_PATHS


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

    # The container filesystem markers are the other signals is_ci_environment
    # checks. Force ALL of them absent (RWX itself runs in a container, so a real
    # /var/run/secrets/kubernetes.io/serviceaccount or /run/.containerenv on the
    # runner would otherwise make the 'regular user' tests see a CI env), but pass
    # every other path through to the real check.
    real_exists = os.path.exists
    monkeypatch.setattr(
        os.path,
        "exists",
        lambda path, _e=real_exists: False if path in CONTAINER_MARKER_PATHS else _e(path),
    )
