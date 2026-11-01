"""VIS-1196: which files `visivo format` is allowed to touch.

`Discover.files` is built for parsing, so it deliberately returns more than a
formatter may write to. Getting this wrong is not a cosmetic bug: formatting a
git-backed include dirties a clone of somebody else's repository, and formatting
the profile rewrites the user's credentials file.
"""

import os

from visivo.commands.format_phase import _project_files, format_phase

PROJECT = """\
name: demo
models:
  - sql: SELECT 1
    name: orders
"""


def _project(tmp_path):
    (tmp_path / "project.visivo.yml").write_text(PROJECT)
    return str(tmp_path)


class TestWhichFilesAreFormatted:
    def test_the_project_file_is_included(self, tmp_path):
        working_dir = _project(tmp_path)

        files = _project_files(working_dir, os.path.join(working_dir, "target"), ())

        assert [os.path.basename(f) for f in files] == ["project.visivo.yml"]

    def test_git_backed_includes_are_left_alone(self, tmp_path):
        """`.visivo_cache` holds clones of other people's repositories."""
        working_dir = _project(tmp_path)
        cache = tmp_path / ".visivo_cache" / "someone-else"
        cache.mkdir(parents=True)
        (cache / "models.yml").write_text(PROJECT)

        files = _project_files(working_dir, os.path.join(working_dir, "target"), ())

        assert not any(".visivo_cache" in f for f in files)

    def test_the_output_directory_is_left_alone(self, tmp_path):
        working_dir = _project(tmp_path)
        target = tmp_path / "target"
        target.mkdir()
        (target / "generated.yml").write_text(PROJECT)

        files = _project_files(working_dir, str(target), ())

        assert not any("target" in f for f in files)

    def test_explicit_paths_win(self, tmp_path):
        working_dir = _project(tmp_path)
        other = tmp_path / "other.yml"
        other.write_text(PROJECT)

        files = _project_files(working_dir, os.path.join(working_dir, "target"), (str(other),))

        assert files == [str(other)]


class TestCheckMode:
    def test_check_reports_without_writing(self, tmp_path):
        working_dir = _project(tmp_path)
        before = (tmp_path / "project.visivo.yml").read_text()

        changed = format_phase(working_dir, os.path.join(working_dir, "target"), check=True)

        assert changed == 1
        assert (tmp_path / "project.visivo.yml").read_text() == before

    def test_formatting_then_checking_is_clean(self, tmp_path):
        working_dir = _project(tmp_path)
        output_dir = os.path.join(working_dir, "target")

        assert format_phase(working_dir, output_dir) == 1
        assert format_phase(working_dir, output_dir, check=True) == 0
