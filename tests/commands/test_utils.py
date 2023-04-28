import pytest
import click
from tests.factories.model_factories import TargetFactory
from tests.factories.model_factories import ProjectFactory
from visivo.commands.utils import find_or_create_target


def test_find_or_create_target_no_targets():
    project = ProjectFactory(targets=[])

    with pytest.raises(click.ClickException) as exc_info:
        find_or_create_target(project=project, target_or_name=None)

    message = exc_info.value.message
    assert (
        message
        == "The project must contain a target or a target must be passed as an object on the command line."
    )


def test_find_or_create_target_no_targets_with_passed():
    project = ProjectFactory(targets=[])

    found_target = find_or_create_target(
        project=project, target_or_name='{"name":"name", "database":"database"}'
    )
    assert found_target.name == "name"


def test_find_or_create_target_one_target():
    target = TargetFactory()
    project = ProjectFactory(targets=[target])

    found_target = find_or_create_target(project=project, target_or_name=None)
    assert found_target.name == target.name


def test_find_or_create_target_two_target():
    target_first = TargetFactory(name="first")
    target_second = TargetFactory(name="second")
    project = ProjectFactory(targets=[target_first, target_second])

    with pytest.raises(click.ClickException) as exc_info:
        find_or_create_target(project=project, target_or_name=None)

    message = exc_info.value.message
    assert (
        message
        == "When the project has multiple targets a target must be defined with a default or on the command line."
    )


def test_find_or_create_target_two_target_with_missing_name():
    target_first = TargetFactory(name="first")
    target_second = TargetFactory(name="second")
    project = ProjectFactory(targets=[target_first, target_second])

    with pytest.raises(click.ClickException) as exc_info:
        find_or_create_target(project=project, target_or_name="third")

    message = exc_info.value.message
    assert message == "Target with name: 'third' was not found in the project."


def test_find_or_create_target_two_target_with_name():
    target_first = TargetFactory(name="first")
    target_second = TargetFactory(name="second")
    project = ProjectFactory(targets=[target_first, target_second])

    found_target = find_or_create_target(project=project, target_or_name="second")
    assert found_target.name == target_second.name
