from visivo.command_line import load_env
from tests.support.utils import temp_file
import os
import sys
from io import StringIO
from unittest.mock import patch

import click
import pytest


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


def test_click_exception_shown_cleanly_without_issue_url():
    """Smoke-test bug #14: a ClickException (e.g. a YAML syntax error wrapped by
    load_yaml_file with file:line + the problem) is a clean USER error. It must
    NOT go through the generic "unexpected error / report this issue" path,
    whose issue URL percent-encodes the ENTIRE stack trace into a giant OSC-8
    terminal hyperlink."""
    import visivo.command_line as cl

    clean_message = "Invalid yaml in project\n  Location: p.yml:5[4]\n  Issue: expected <block end>"

    stdout = StringIO()
    sys.stdout = stdout
    try:
        with patch.object(cl, "visivo", side_effect=click.ClickException(clean_message)):
            with pytest.raises(SystemExit) as exc_info:
                cl.safe_visivo()
    finally:
        sys.stdout = sys.__stdout__
    output = stdout.getvalue()

    assert exc_info.value.code == 1
    # The clean, located message is shown...
    assert "Invalid yaml in project" in output
    assert "p.yml:5[4]" in output
    # ...and the generic bug-report path is NOT triggered.
    assert "An unexpected error has occurred" not in output
    assert "Click here to report this issue" not in output
    assert "issues/new" not in output


def test_generic_exception_still_reports_the_issue_url():
    """A genuinely unexpected error still gets the report-issue path — the
    ClickException branch must not swallow real bugs."""
    import visivo.command_line as cl

    stdout = StringIO()
    sys.stdout = stdout
    try:
        with patch.object(cl, "visivo", side_effect=RuntimeError("boom")):
            with patch.dict(os.environ, {}, clear=False):
                os.environ.pop("STACKTRACE", None)
                with pytest.raises(SystemExit):
                    cl.safe_visivo()
    finally:
        sys.stdout = sys.__stdout__
    output = stdout.getvalue()

    assert "An unexpected error has occurred" in output
    assert "Click here to report this issue" in output
