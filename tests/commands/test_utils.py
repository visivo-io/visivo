import pytest
import click
from tests.factories.model_factories import TargetFactory
from tests.factories.model_factories import ProjectFactory
from visivo.commands.utils import find_named_or_default_target


def test_find_named_or_default_target_no_targets():
    project = ProjectFactory(targets=[])

    with pytest.raises(click.ClickException) as exc_info:
        find_named_or_default_target(project=project, target_name=None)

    message = exc_info.value.message
    assert message == "The project must contain a target."


def test_find_named_or_default_target_one_target():
    target = TargetFactory()
    project = ProjectFactory(targets=[target])

    found_target = find_named_or_default_target(project=project, target_name=None)
    assert found_target.name == target.name


def test_find_named_or_default_target_two_target():
    target_first = TargetFactory(name="first")
    target_second = TargetFactory(name="second")
    project = ProjectFactory(targets=[target_first, target_second])

    with pytest.raises(click.ClickException) as exc_info:
        find_named_or_default_target(project=project, target_name=None)

    message = exc_info.value.message
    assert (
        message
        == "Multiple targets available and neither default target or trace target were provided."
    )


def test_find_named_or_default_target_two_target_with_missing_name():
    target_first = TargetFactory(name="first")
    target_second = TargetFactory(name="second")
    project = ProjectFactory(targets=[target_first, target_second])

    with pytest.raises(click.ClickException) as exc_info:
        find_named_or_default_target(project=project, target_name="third")

    message = exc_info.value.message
    assert message == "Target with name: 'third' was not found in the project."


def test_find_named_or_default_target_two_target_with_name():
    target_first = TargetFactory(name="first")
    target_second = TargetFactory(name="second")
    project = ProjectFactory(targets=[target_first, target_second])

    found_target = find_named_or_default_target(project=project, target_name="second")
    assert found_target.name == target_second.name
