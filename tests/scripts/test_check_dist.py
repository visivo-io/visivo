import importlib.util
import io
import shutil
import subprocess
import tarfile
import zipfile
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / ".github" / "scripts" / "check_dist.py"

spec = importlib.util.spec_from_file_location("check_dist", SCRIPT)
check_dist = importlib.util.module_from_spec(spec)
spec.loader.exec_module(check_dist)


def _sdist(path, members):
    with tarfile.open(path, "w:gz") as sdist:
        for name in members:
            info = tarfile.TarInfo(f"visivo-9.9.9/{name}")
            info.size = 2
            sdist.addfile(info, io.BytesIO(b"{}"))
    return path


def _wheel(path):
    with zipfile.ZipFile(path, "w") as wheel:
        wheel.writestr("visivo/__init__.py", "")
    return path


CLEAN = ["PKG-INFO", "pyproject.toml", "README.md", ".gitignore", "visivo/__init__.py"]


def test_a_package_only_sdist_and_wheel_pass(tmp_path):
    _sdist(tmp_path / "visivo-9.9.9.tar.gz", CLEAN)
    _wheel(tmp_path / "visivo-9.9.9-py3-none-any.whl")

    assert check_dist.check(tmp_path) == []
    assert check_dist.main([str(tmp_path)]) == 0


def test_sdist_members_outside_the_package_are_refused(tmp_path):
    _sdist(
        tmp_path / "visivo-9.9.9.tar.gz",
        CLEAN + ["artifacts/visivo-linux-x86/visivo", "viewer/package.json", "visivo_extra.py"],
    )

    problems = check_dist.check(tmp_path)

    assert len(problems) == 1
    assert "3 members outside visivo/" in problems[0]
    assert "artifacts/visivo-linux-x86/visivo" in problems[0]
    assert check_dist.main([str(tmp_path)]) == 1


def test_a_file_over_the_limit_is_refused(tmp_path):
    _sdist(tmp_path / "visivo-9.9.9.tar.gz", CLEAN)
    big = _wheel(tmp_path / "visivo-9.9.9-py3-none-any.whl")
    big.write_bytes(big.read_bytes() + b"\0" * 2_000_000)

    problems = check_dist.check(tmp_path, max_mb=1)

    assert problems == [
        f"{big.name} is {big.stat().st_size / 1_000_000:.1f} MB, over the 1 MB limit"
    ]


def test_an_empty_dist_dir_is_refused(tmp_path):
    assert check_dist.check(tmp_path) == [f"{tmp_path} has no wheel or sdist"]


@pytest.mark.skipif(shutil.which("uv") is None, reason="uv is not installed")
def test_the_real_sdist_ships_only_the_package(tmp_path):
    """Build the sdist from this checkout. Files outside visivo/ that are not
    gitignored (tests/, viewer/, a release job's downloaded binaries) must not
    reach it."""
    decoy = REPO / "check-dist-decoy.txt"
    decoy.write_text("not part of the package")
    try:
        subprocess.run(
            ["uv", "build", "--sdist", "--out-dir", str(tmp_path)],
            cwd=REPO,
            check=True,
            capture_output=True,
        )
    finally:
        decoy.unlink()

    sdist = next(tmp_path.glob("*.tar.gz"))
    with tarfile.open(sdist) as archive:
        names = {name.split("/", 1)[1] for name in archive.getnames() if "/" in name}

    assert check_dist.stray_sdist_members(sdist) == []
    assert "check-dist-decoy.txt" not in names
    assert {"visivo/__init__.py", "visivo/viewers/dist/index.html", "README.md"} <= names
