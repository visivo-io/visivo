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


def test_importing_command_line_does_not_eagerly_import_subcommands():
    """The lazy-load contract (VIS-1191): importing the CLI entry must NOT pull
    in every subcommand's module graph. A fresh interpreter is used so other
    tests' imports can't mask a regression.

    `visivo run` should pay the import cost of `run` alone — not deploy, serve,
    dbt, dist, and the rest — which matters for every `visivo run` a Celery
    worker spawns."""
    import subprocess

    code = (
        "import sys, visivo.command_line\n"
        "heavy = ('visivo.commands.run', 'visivo.commands.deploy',\n"
        "         'visivo.commands.serve', 'visivo.commands.dbt',\n"
        "         'visivo.commands.dist')\n"
        "eager = [m for m in heavy if m in sys.modules]\n"
        "assert not eager, 'eagerly imported: %s' % eager\n"
        "print('ok')\n"
    )
    result = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
    assert "ok" in result.stdout


def test_lazy_group_lists_and_resolves_every_command():
    """Every command is still listed in --help and resolves lazily, and its CLI
    name matches the mapping key (guards against a command whose own name drifts
    from the key we registered it under)."""
    from click.testing import CliRunner
    from visivo.command_line import visivo, LazyGroup

    listed = CliRunner().invoke(visivo, ["--help"])
    assert listed.exit_code == 0
    for name in LazyGroup.lazy_subcommands:
        assert name in listed.output
        cmd = visivo.get_command(None, name)
        assert cmd is not None, f"{name} did not resolve"
        assert cmd.name == name, f"mapping key {name!r} != command name {cmd.name!r}"

    # An unknown command is a clean miss, not an import error.
    assert visivo.get_command(None, "definitely-not-a-command") is None
