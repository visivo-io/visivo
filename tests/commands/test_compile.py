import os
from visivo.commands.compile import compile
from visivo.parsers.file_names import PROJECT_FILE_NAME
from tests.support.utils import temp_yml_file
from click.testing import CliRunner

runner = CliRunner()


def test_compile():
    tmp = temp_yml_file(dict={"name": "project"}, name=PROJECT_FILE_NAME)
    dir = os.path.dirname(tmp)

    response = runner.invoke(compile, ["-w", dir])

    assert "Compiling" in response.output
    assert response.exit_code == 0
