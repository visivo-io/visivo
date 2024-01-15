from click.testing import CliRunner
from visivo.command_line import visivo

runner = CliRunner()


def test_version():
    response = runner.invoke(visivo, ["--version"])
    assert "visivo, version" in response.output
    assert response.exit_code == 0
