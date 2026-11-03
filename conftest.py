import shutil
import os


def pytest_configure(config):
    # Disable telemetry for all tests
    os.environ["VISIVO_TELEMETRY_DISABLED"] = "true"

    if "PYTEST_XDIST_WORKER" not in os.environ and os.path.exists("tmp"):
        shutil.rmtree("tmp")
