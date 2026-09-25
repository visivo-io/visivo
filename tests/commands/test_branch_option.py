"""``--branch``, with ``--stage`` still accepted (VIS-1352).

A stage is a branch, and the word changed everywhere else. This is the last
place it is spoken out loud, and it is a **required** flag in everybody's CI —
so the old name keeps working until a release that can afford to break it.

The property worth pinning is that they are one parameter rather than two
options, so there is no state where a caller passes both and one silently wins.
"""

from unittest.mock import patch

import pytest
from click.testing import CliRunner

from visivo.commands.archive import archive
from visivo.commands.deploy import deploy


def _deploy(*args):
    with patch("visivo.commands.deploy_phase.deploy_phase", return_value="url") as phase:
        result = CliRunner().invoke(deploy, list(args))
    return result, phase


@pytest.mark.parametrize("flag", ["--branch", "-b", "--stage", "-s"])
def test_every_spelling_reaches_the_same_parameter(flag):
    result, phase = _deploy(flag, "production")

    assert result.exit_code == 0
    assert phase.call_args.kwargs["branch"] == "production"


def test_the_old_name_is_still_accepted():
    """The one that matters: an unchanged CI pipeline keeps deploying."""
    result, phase = _deploy("--stage", "production")

    assert result.exit_code == 0
    assert phase.call_args.kwargs["branch"] == "production"


def test_passing_both_is_not_two_values():
    """One parameter, so the last one wins rather than one being dropped
    silently while the other is used."""
    result, phase = _deploy("--stage", "old", "--branch", "new")

    assert result.exit_code == 0
    assert phase.call_args.kwargs["branch"] == "new"


def test_it_is_still_required():
    result, _ = _deploy()

    assert result.exit_code != 0


@pytest.mark.parametrize("value", ["  ", "bad/name"])
def test_the_name_is_still_validated(value):
    """The validator moved with the option; it did not get lost in the rename."""
    result, _ = _deploy("--branch", value)

    assert result.exit_code != 0


def test_archive_takes_both_spellings_too():
    """Archive shares the option, so it inherits the alias — worth asserting
    rather than assuming, since it is the other command that names a branch."""
    for flag in ("--branch", "--stage"):
        with patch("visivo.commands.archive_phase.archive_phase") as phase:
            result = CliRunner().invoke(archive, [flag, "production"])

        assert result.exit_code == 0, result.output
        assert phase.call_args.kwargs["branch"] == "production"
