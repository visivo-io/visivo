"""``InputManager`` is the one override of the base serializer, and it drifted.

The base ``ObjectManager._serialize_object`` strips both location fields;
``InputManager`` stripped only ``path``. So an input DEFINED IN AN INCLUDE FILE
— the only case where ``file_path`` is non-None — handed its absolute,
machine-local YAML path out over the API, and back into the config a client
re-saves. The integration fixture keeps every input in the root project file,
so nothing there can see it: this is the case that makes the leak visible.
"""

from tests.factories.model_factories import MultiSelectInputFactory, SingleSelectInputFactory
from visivo.server.managers.input_manager import InputManager
from visivo.server.managers.object_manager import ObjectStatus


def _config(input_obj):
    return InputManager()._serialize_object(input_obj.name, input_obj, ObjectStatus.PUBLISHED)[
        "config"
    ]


def test_an_input_from_an_include_file_does_not_leak_its_file_path():
    input_obj = SingleSelectInputFactory(name="region")
    input_obj.path = "project.inputs[2]"
    input_obj.file_path = "/Users/someone/repo/includes/inputs.visivo.yml"

    config = _config(input_obj)

    assert "file_path" not in config
    assert "path" not in config


def test_the_same_holds_for_multi_select():
    input_obj = MultiSelectInputFactory(name="tags")
    input_obj.file_path = "/Users/someone/repo/includes/inputs.visivo.yml"

    assert "file_path" not in _config(input_obj)


def test_the_config_still_carries_the_input_itself():
    """The complement: stripping location must not strip configuration."""
    input_obj = SingleSelectInputFactory(name="region", options=["East", "West"])
    input_obj.file_path = "/Users/someone/repo/includes/inputs.visivo.yml"

    config = _config(input_obj)

    assert config["name"] == "region"
    assert config["options"] == ["East", "West"]


def test_nothing_downstream_would_have_caught_the_leak():
    """Why the serializer is the only place this can be stopped.

    ``file_path`` is a DECLARED field of every named model, so a leaked one
    re-validates cleanly — the parser's ``extra='forbid'`` never fires, and
    ``objects_equal`` now ignores location fields, so no status goes wrong
    either. Nothing downstream would have reported it; it would simply have
    travelled out to the client and back. Pinned so a future reader does not
    assume some later gate is covering this.
    """
    manager = InputManager()
    leaky = dict(_config(SingleSelectInputFactory(name="region")))
    leaky["file_path"] = "/Users/someone/repo/includes/inputs.visivo.yml"

    revalidated = manager.validate_object(leaky)

    assert revalidated.file_path == "/Users/someone/repo/includes/inputs.visivo.yml"
