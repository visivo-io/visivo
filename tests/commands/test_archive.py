from click.testing import CliRunner
from tests.support.utils import temp_file, temp_folder
from visivo.commands.archive import archive
from visivo.parsers.file_names import PROFILE_FILE_NAME

runner = CliRunner()


def test_archive_without_permission():
    output_dir = temp_folder()
    temp_file(PROFILE_FILE_NAME, "key: value", output_dir + "/.visivo")
    response = runner.invoke(archive, ["-s", "test", "-u", output_dir])
    assert "no token found" in response.output or "No token in profile.yml" in response.output
    assert response.exit_code == 1
