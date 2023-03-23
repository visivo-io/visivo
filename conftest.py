import shutil
import os


def pytest_configure(config):
    if os.path.exists("tmp"):
        shutil.rmtree("tmp")
