from visivo.commands.init import init
from tests.support.utils import temp_folder
from click.testing import CliRunner

runner = CliRunner()


def test_compile():
    tmp = temp_folder()

    response = runner.invoke(init, ["-n", tmp])
    assert response.exit_code == 0
    assert f"Creating project in '{tmp}'" in response.output
