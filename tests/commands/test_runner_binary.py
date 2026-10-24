import json
import os
from pathlib import Path
import subprocess
import sys

from click.testing import CliRunner
import pytest

from tests.factories.model_factories import SourceFactory
from tests.commands.test_run import _make_runnable_project
from visivo.commands.utils import create_file_database
from visivo.runner_binary import visivo
from visivo.version import VISIVO_VERSION


def test_run_only_entry_exposes_run_and_version():
    assert set(visivo.commands) == {"run"}
    result = CliRunner().invoke(visivo, ["--version"])
    assert result.exit_code == 0
    assert VISIVO_VERSION in result.output


@pytest.mark.parametrize("failing_query", [False, True])
def test_run_only_entry_builds_without_importing_server_or_agent(tmp_path, failing_query):
    source = SourceFactory(database=str(tmp_path / "source.sqlite"))
    project = _make_runnable_project(sources=[source])
    if failing_query:
        project.models[0].sql = "SELECT * FROM missing_table"
    create_file_database(source.url(), str(tmp_path))
    (tmp_path / "project.visivo.yml").write_text(project.model_dump_json())
    output_dir = tmp_path / "target"
    script = """
import sys
from click.testing import CliRunner
from visivo.runner_binary import visivo

result = CliRunner().invoke(visivo, sys.argv[1:])
print(result.output)
for prefix in ("visivo.server", "visivo.agent", "pydantic_ai", "google.genai"):
    assert not any(name == prefix or name.startswith(prefix + ".") for name in sys.modules), prefix
sys.exit(result.exit_code)
"""
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            script,
            "run",
            "--working-dir",
            str(tmp_path),
            "--output-dir",
            str(output_dir),
        ],
        cwd=Path(__file__).resolve().parents[2],
        env={**os.environ, "VISIVO_TELEMETRY_DISABLED": "true"},
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode == (1 if failing_query else 0), result.stdout + result.stderr
    assert "AssertionError" not in result.stderr, result.stderr
    if failing_query:
        assert "Run failed" in result.stdout
    else:
        assert (output_dir / "main/insights/insight.parquet").exists()
        assert (output_dir / "main/schemas/model.json").exists()
        insight = json.loads((output_dir / "main/insights/insight.json").read_text())
        assert insight["name"] == "insight"
