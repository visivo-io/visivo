from unittest.mock import MagicMock

import pytest

from visivo.commands.cloud_next_steps import (
    AUTHORIZE_COMMAND,
    DEPLOY_COMMAND,
    SAMPLE_AGENT_PROMPTS,
    cloud_next_steps,
    log_cloud_next_steps,
    sample_agent_prompt,
)
from visivo.commands.init import with_cloud_next_steps
from visivo.models.example_type import ExampleTypeEnum


def test_every_sample_has_an_agent_prompt():
    assert set(SAMPLE_AGENT_PROMPTS) == set(ExampleTypeEnum)


@pytest.mark.parametrize("example", [e.value for e in ExampleTypeEnum])
def test_next_steps_name_the_exact_commands_and_the_prompt(example):
    text = cloud_next_steps(example)

    assert "Publish this to Visivo Cloud" in text
    assert f"  {AUTHORIZE_COMMAND}\n" in text
    assert f"  {DEPLOY_COMMAND}\n" in text
    assert sample_agent_prompt(example) in text


def test_deploy_command_parses_against_the_cli():
    from click.testing import CliRunner
    from visivo.command_line import visivo

    args = DEPLOY_COMMAND.split()[1:] + ["--help"]
    result = CliRunner().invoke(visivo, args)

    assert result.exit_code == 0, result.output


@pytest.mark.parametrize("example", [e.value for e in ExampleTypeEnum])
def test_prompt_names_the_samples_dashboard(example):
    from pathlib import Path
    from ruamel.yaml import YAML

    from visivo.commands.init_phase import SAMPLE_DIR_MAP, _bundled_samples_root

    project_file = (
        _bundled_samples_root() / SAMPLE_DIR_MAP[ExampleTypeEnum(example)] / "project.visivo.yml"
    )
    dashboards = YAML().load(Path(project_file).read_text())["dashboards"]

    assert dashboards[0]["name"] in sample_agent_prompt(example)


def test_unknown_example_gets_commands_without_a_prompt():
    assert sample_agent_prompt("not-a-sample") is None
    text = cloud_next_steps("not-a-sample")
    assert DEPLOY_COMMAND in text
    assert "Agent tab" not in text


def test_log_cloud_next_steps_logs_the_block(monkeypatch):
    logger = MagicMock()
    monkeypatch.setattr("visivo.logger.logger.Logger.instance", lambda: logger)

    log_cloud_next_steps("ev-sales")

    logger.info.assert_called_once_with(cloud_next_steps("ev-sales"))


def test_init_wrapper_logs_after_the_build_finishes(monkeypatch):
    order = []
    monkeypatch.setattr(
        "visivo.commands.cloud_next_steps.log_cloud_next_steps",
        lambda example: order.append(("next_steps", example)),
    )

    def on_ready(one_shot=False):
        order.append(("build", one_shot))
        return "done"

    assert with_cloud_next_steps(on_ready, "ev-sales")(one_shot=False) == "done"
    assert order == [("build", False), ("next_steps", "ev-sales")]
