"""Smoke tests for the bundled onboarding sample projects.

Each sample under visivo/templates/samples/<name>/ is the canonical
"Use a sample" payload for the onboarding flow. They MUST stay in sync
with the current Project schema — historically the public ev-sales /
github-releases / college-football repos drifted to 1.x and crashed the
2.0 viewer at parse time. These tests:

  1. Copy the bundled sample into a tmp directory.
  2. Invoke load_example_project to mirror what /api/project/load_example/
     does at runtime (drops a fresh .env, rewrites project name).
  3. Parse the resulting project with the current Project model (and
     run a full visivo run on it) so any breaking schema change to the
     Project / Insight / Chart / Dashboard / CsvScriptModel models
     surfaces as a CI failure instead of a broken first-run experience.
"""

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from visivo.commands.init_phase import (
    SAMPLE_DIR_MAP,
    _bundled_samples_root,
    load_example_project,
)
from visivo.models.example_type import ExampleTypeEnum
from visivo.parsers.parser_factory import ParserFactory


SAMPLES = list(SAMPLE_DIR_MAP.items())


@pytest.fixture
def cd_tmp(tmp_path, monkeypatch):
    """visivo's parser walks from cwd; chdir into the tmp project dir."""
    monkeypatch.chdir(tmp_path)
    return tmp_path


@pytest.mark.parametrize("example_type,sample_dir", SAMPLES, ids=[s[1] for s in SAMPLES])
def test_bundled_sample_directory_exists(example_type, sample_dir):
    """Every sample referenced by the API has a directory in the wheel."""
    src = _bundled_samples_root() / sample_dir
    assert src.is_dir(), f"missing bundled sample at {src}"
    assert (src / "project.visivo.yml").is_file(), f"sample {sample_dir} missing project file"


@pytest.mark.parametrize("example_type,sample_dir", SAMPLES, ids=[s[1] for s in SAMPLES])
def test_load_example_copies_files(example_type, sample_dir, tmp_path):
    """load_example_project copies the bundled sample into a target directory."""
    target = tmp_path / "project"
    target.mkdir()
    project_file = load_example_project(
        project_name="My Sample",
        example_type=example_type,
        project_dir=str(target),
    )
    assert project_file is not None
    assert (target / "project.visivo.yml").exists()
    # The user-facing project name is stamped into the YAML on copy.
    text = (target / "project.visivo.yml").read_text()
    assert "My Sample" in text


@pytest.mark.parametrize("example_type,sample_dir", SAMPLES, ids=[s[1] for s in SAMPLES])
def test_bundled_sample_parses_with_current_schema(example_type, sample_dir, tmp_path, monkeypatch):
    """A copied sample parses against the current Project model.

    This is the regression net for schema drift: any field rename or
    removal that breaks a sample shows up here, not in production
    onboarding.
    """
    target = tmp_path / "project"
    target.mkdir()
    load_example_project(
        project_name="Sample under test",
        example_type=example_type,
        project_dir=str(target),
    )

    monkeypatch.chdir(target)
    parser = ParserFactory().build(project_file=target / "project.visivo.yml", files=[])
    project = parser.parse()

    assert project.name == "Sample under test"
    # Every sample ships at least one model, one insight, and one
    # dashboard. If a sample loses any of those, that's a regression
    # against the design brief (each sample is a "fully built Visivo
    # project").
    assert len(project.models) >= 1, f"{sample_dir} has no models"
    assert len(project.insights) >= 1, f"{sample_dir} has no insights"
    assert len(project.dashboards) >= 1, f"{sample_dir} has no dashboards"


@pytest.mark.parametrize("example_type,sample_dir", SAMPLES, ids=[s[1] for s in SAMPLES])
def test_bundled_sample_runs_end_to_end(example_type, sample_dir, tmp_path):
    """`visivo run` succeeds on a copied sample.

    Slower than the parse test (executes the CSV models + data
    pipeline) but catches runtime issues like missing data files,
    malformed CSV, or query-time SQL errors.
    """
    target = tmp_path / "project"
    target.mkdir()
    load_example_project(
        project_name="Run smoke",
        example_type=example_type,
        project_dir=str(target),
    )

    visivo_bin = shutil.which("visivo")
    if not visivo_bin:
        pytest.skip("visivo CLI not on PATH")

    result = subprocess.run(
        [visivo_bin, "run"],
        cwd=target,
        capture_output=True,
        text=True,
        timeout=120,
        env={"PATH": Path(visivo_bin).parent.as_posix() + ":/usr/bin:/bin"},
    )
    assert result.returncode == 0, (
        f"`visivo run` failed for {sample_dir}\n"
        f"stdout:\n{result.stdout}\n"
        f"stderr:\n{result.stderr}"
    )
