# -*- encoding: utf-8 -*-

"""Everything the CLI reads at runtime has to be in the package.

A missing module fails loudly at import. Missing DATA does not: it is read
through ``importlib.resources`` at the moment a feature is used, so the build
succeeds, the binary starts, and the feature is simply gone. The shipped
PyInstaller build was missing three things at once this way — the project
schema the viewer fetches, two thirds of the agent's skills, and every chart
rule — and nothing said so.

These tests read the build scripts rather than a built artifact, because
building takes minutes and the omission is visible in the arguments.
"""

import re
import subprocess
from pathlib import Path

import pytest

REPO = Path(__file__).parent.parent
PACKAGE = REPO / "visivo"

# Data the running CLI reads from inside its own package. Adding one here is
# the point: a new runtime resource has to be declared to both builders, and
# this is what remembers to ask.
RUNTIME_DATA = {
    "visivo/src": "the project schema the viewer fetches from /api/schema",
    "visivo/schema": "per-trace plotly schemas",
    "visivo/viewers": "the built React viewer",
    "visivo/agent/skills": "agent skills, INCLUDING the charts/ and interactions/ namespaces",
    "visivo/agent/charting/rules": "chart recommendation rules",
    "visivo/models/dashboards": "template_policy.json",
    "visivo/templates/samples": "sample projects for `visivo init --example` and onboarding",
}

# Data files in the package that nothing reads at run time.
NOT_RUNTIME = {
    "visivo/agent/charting/families.json": "written by families_export for the viewer build",
}


def _build_args(script):
    """The argument list a build script passes to its freezer, as one string."""
    return (PACKAGE / script).read_text()


@pytest.mark.parametrize("resource,why", sorted(RUNTIME_DATA.items()))
def test_pyinstaller_ships_every_runtime_resource(resource, why):
    args = _build_args("build.py")
    assert resource in args, f"build.py does not ship {resource} — {why}"


@pytest.mark.parametrize("resource,why", sorted(RUNTIME_DATA.items()))
def test_nuitka_ships_every_runtime_resource(resource, why):
    """The two builders must agree. They did not: each shipped something the
    other dropped, so which one released decided which features worked."""
    args = _build_args("build_nuitka.py")
    # Nuitka takes paths built from `HERE`, so match on the tail.
    tail = resource.split("visivo/", 1)[1]
    parts = [f"'{part}'" for part in tail.split("/")]
    assert all(part in args for part in parts), f"build_nuitka.py does not ship {resource} — {why}"


def _tracked_package_files(repo):
    """Files under ``visivo/`` that git tracks, so local clutter never counts."""
    try:
        listed = subprocess.run(
            ["git", "ls-files", "-z", "visivo"],
            cwd=repo,
            capture_output=True,
            text=True,
            check=True,
        ).stdout
    except (OSError, subprocess.CalledProcessError) as error:
        pytest.skip(f"git cannot list the tracked package files here: {error}")
    return [Path(rel) for rel in listed.split("\0") if rel]


def _uncovered_data_files(rel_paths):
    uncovered = []
    for path in rel_paths:
        rel = path.as_posix()
        if path.suffix in {".py", ".pyc"}:
            continue
        if "__pycache__" in path.parts or "tests" in path.parts[1:]:
            continue
        if rel in NOT_RUNTIME or any(rel.startswith(d + "/") for d in RUNTIME_DATA):
            continue
        uncovered.append(rel)
    return uncovered


def test_every_data_file_in_the_package_is_covered_by_a_shipped_directory():
    """Python files are traced by the freezer; anything else is not. A new data
    file outside every declared directory fails here instead of in a release."""
    uncovered = _uncovered_data_files(_tracked_package_files(REPO))
    assert not uncovered, (
        f"Data files not shipped by build.py/build_nuitka.py: {uncovered[:5]}. "
        "Add their directory to RUNTIME_DATA and both build scripts."
    )


def test_untracked_and_ignored_files_are_not_data_files(tmp_path):
    def git(*args):
        subprocess.run(["git", *args], cwd=tmp_path, check=True, capture_output=True)

    git("init", "-q")
    (tmp_path / ".gitignore").write_text(".DS_Store\n")
    (tmp_path / "visivo" / "server" / "tmp").mkdir(parents=True)
    (tmp_path / "visivo" / "rules.json").write_text("{}")
    (tmp_path / "visivo" / ".DS_Store").write_text("")
    (tmp_path / "visivo" / "server" / "tmp" / "worksheets.db").write_text("")
    git("add", ".gitignore", "visivo/rules.json")

    files = _tracked_package_files(tmp_path)

    assert files == [Path("visivo/rules.json")]
    assert _uncovered_data_files(files) == ["visivo/rules.json"]


def test_the_data_file_check_skips_without_git(monkeypatch):
    def no_git(*args, **kwargs):
        raise FileNotFoundError("git")

    monkeypatch.setattr(subprocess, "run", no_git)

    with pytest.raises(pytest.skip.Exception, match="git cannot list"):
        _tracked_package_files(REPO)


class TestDirectoriesAreShippedWhole:
    """A glob over a directory that has subdirectories ships only the top of
    it. `visivo/agent/skills/*.md` shipped 16 skills and silently left 32
    behind, because a subdirectory under skills/ is a namespace."""

    def _nested(self, directory):
        return [
            p
            for p in (PACKAGE / directory).rglob("*")
            if p.is_file() and p.parent != PACKAGE / directory
        ]

    @pytest.mark.parametrize(
        "directory", ["agent/skills", "agent/charting/rules", "templates/samples"]
    )
    def test_the_directory_actually_has_nested_files(self, directory):
        """If this fails the guard below has stopped guarding anything."""
        assert self._nested(
            directory
        ), f"{directory} has no nested files; is this test still needed?"

    @pytest.mark.parametrize(
        "directory", ["agent/skills", "agent/charting/rules", "templates/samples"]
    )
    def test_pyinstaller_takes_the_directory_not_a_glob(self, directory):
        args = _build_args("build.py")
        glob = re.search(rf"visivo/{re.escape(directory)}/\*[^:\"]*:", args)
        assert glob is None, (
            f"build.py ships visivo/{directory} with a glob ({glob.group(0) if glob else ''}), "
            "which skips its subdirectories. Pass the directory instead."
        )
        assert f"visivo/{directory}:visivo/{directory}" in args


class TestTheSkillsOnDiskAreTheSkillsShipped:
    """The agent's prompt advertises every skill it finds on disk. Shipping a
    subset means the index offers skills that `read_skill` cannot open."""

    def test_every_skill_is_under_the_shipped_directory(self):
        from visivo.agent import skills

        packaged = {skill["name"] for skill in skills.packaged()}
        on_disk = {
            str(path.relative_to(skills.SKILLS_DIR)).removesuffix(".md")
            for path in skills.SKILLS_DIR.rglob("*.md")
            # Documentation for whoever writes a skill, not a skill.
            if path.name != "README.md"
        }
        assert packaged == on_disk

    def test_the_namespaced_skills_are_the_majority(self):
        """Stated as a fact so the glob bug cannot come back quietly: most of
        the skill set lives in subdirectories."""
        from visivo.agent import skills

        nested = [p for p in skills.SKILLS_DIR.rglob("*.md") if p.parent != skills.SKILLS_DIR]
        top = list(skills.SKILLS_DIR.glob("*.md"))
        assert len(nested) > len(top)
