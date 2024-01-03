from tests.support.utils import temp_file, temp_folder
from visivo.parsers.yaml_ordered_dict import YamlOrderedDict, setup_yaml_ordered_dict
import yaml
import json


def test_setup_yaml_ordered_dict():
    output_dir = temp_folder()
    file = temp_file(
        contents="\n" + yaml.dump({"model": {"required": "value"}}),
        output_dir=output_dir,
        name="model.yml",
    )
    setup_yaml_ordered_dict()
    with open(file, "r") as file:
        loaded = yaml.safe_load(file)

    assert loaded.__class__ == YamlOrderedDict
    assert list(loaded._key_locs.values())[0] == f"{output_dir}/model.yml:2"
    assert list(loaded["model"]._key_locs.values())[0] == f"{output_dir}/model.yml:3"


def test_str():
    subject = YamlOrderedDict()
    subject["test"] = "value"
    assert str(subject) == json.dumps({"test": "value"})
