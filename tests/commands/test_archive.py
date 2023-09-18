import os
from click.testing import CliRunner
from visivo.commands.archive import archive

runner = CliRunner()


def test_archive_without_permission():
    response = runner.invoke(archive, ["-s", "test"])
    assert "Token not authorized for hos" in response.output
    assert response.exit_code == 1
