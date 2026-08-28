"""Behaviour of the shared click option decorators."""

import os

import click
import pytest
from click.testing import CliRunner

from visivo.commands.options import working_dir


@pytest.fixture(autouse=True)
def restore_environ():
    snapshot = dict(os.environ)
    yield
    os.environ.clear()
    os.environ.update(snapshot)


@click.command()
@working_dir
def _echo_working_dir(working_dir):
    click.echo(working_dir)


def test_working_dir_loads_that_directory_env_file(tmp_path):
    """`visivo serve -w ./analytics` must load `analytics/.env`.

    The `visivo` group loads `--env-file` (default `.env`) relative to the
    process cwd, before any subcommand option is parsed — so with `-w` the
    project's own .env was never read. That is where the Workspace writes
    externalized source credentials, and once a credential lives only there,
    the `${env.*}` reference in the committed YAML is dead on the next run.
    """
    (tmp_path / ".env").write_text('WORKING_DIR_ONLY_SECRET="hunter2"\n')
    os.environ.pop("WORKING_DIR_ONLY_SECRET", None)

    result = CliRunner().invoke(_echo_working_dir, ["-w", str(tmp_path)])

    assert result.exit_code == 0
    assert os.environ.get("WORKING_DIR_ONLY_SECRET") == "hunter2"


def test_working_dir_does_not_override_an_already_set_value(tmp_path):
    """The cwd .env / --env-file still wins; this only fills in what is unset."""
    (tmp_path / ".env").write_text("ALREADY_SET=from-working-dir\n")
    os.environ["ALREADY_SET"] = "from-cwd"

    CliRunner().invoke(_echo_working_dir, ["-w", str(tmp_path)])

    assert os.environ["ALREADY_SET"] == "from-cwd"


def test_working_dir_without_an_env_file_is_a_noop(tmp_path):
    result = CliRunner().invoke(_echo_working_dir, ["-w", str(tmp_path)])

    assert result.exit_code == 0
    assert result.output.strip() == str(tmp_path)


def test_working_dir_defaults_to_cwd(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)

    result = CliRunner().invoke(_echo_working_dir, [])

    assert result.exit_code == 0
    assert os.path.realpath(result.output.strip()) == os.path.realpath(tmp_path)
