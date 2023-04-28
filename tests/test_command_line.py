from visivo.command_line import load_env
from tests.support.utils import temp_file
import os


def test_CommandLine_env_load_exists():
    path = temp_file(".env.exists", "TEST_VALUE=test")
    load_env(path)
    assert os.getenv("TEST_VALUE") == "test"


def test_CommandLine_env_load_does_not_exists():
    load_env(".env.no-exist")
    assert os.getenv("OTHER_VALUE") == None
