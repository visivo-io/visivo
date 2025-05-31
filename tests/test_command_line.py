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


def test_CommandLine_error_reporting():
    from visivo.command_line import print_issue_url
    from io import StringIO
    import sys

    stdout = StringIO()
    sys.stdout = stdout

    print_issue_url()

    sys.stdout = sys.__stdout__
    output = stdout.getvalue()

    assert "Click here to report this issue" in output
    assert "https://github.com/visivo-io/visivo/issues/new" in output
