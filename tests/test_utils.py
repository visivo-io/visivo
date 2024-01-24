from tests.support.utils import temp_file
from visivo.utils import *


def test_listify():
    assert listify("string") == ["string"]
    assert listify(["string1", "string2"]) == ["string1", "string2"]


def test_yml_to_dict():
    func_recturn = yml_to_dict("tests/fixtures/test_yml_to_dict.yml")
    expected_return = {"this": ["is", "a", "yaml"], "file": "to read"}
    assert expected_return == func_recturn

    response = yml_to_dict(
        "tests/fixtures/folder_with_yamls/nested_folder/nested_yaml_file.yaml"
    )
    expected_response = {
        "dashboards": [
            {
                "name": "Lorem ipsum duo",
                "widgets": {
                    "charts": [
                        {
                            "name": "The name of a chart",
                            "x_position": 0,
                            "y_position": 0,
                        },
                        {
                            "name": "The name of another chart",
                            "x_position": 0,
                            "y_position": 1,
                        },
                    ]
                },
            }
        ],
        "words": 3,
    }
    assert response == expected_response


def test_list_all_ymls_in_dir():
    yaml_list = list_all_ymls_in_dir("tests/fixtures/folder_with_yamls")
    yaml_list = [str(file) for file in yaml_list]
    expected_yaml_list = [
        "tests/fixtures/folder_with_yamls/yml_file.yml",
        "tests/fixtures/folder_with_yamls/yaml_file.yaml",
        "tests/fixtures/folder_with_yamls/nested_folder/nested_yaml_file.yaml",
    ]
    assert all([file in yaml_list for file in expected_yaml_list])


def test_extract_value_from_function():
    function_string = "test(args)"
    argument = extract_value_from_function(function_string, "test")
    assert argument == "args"

    function_string = "test( args )"
    argument = extract_value_from_function(function_string, "test")
    assert argument == "args"


def test_load_yaml_file_with_backslash(monkeypatch):
    password = "^%$#@!~&\\4'a\"}{|+_}"
    monkeypatch.setenv("PASSWORD", password)
    project_file = temp_file(
        "project.visivo.yml",
        "name: \"{{ env_var('PASSWORD') }}\"",
    )

    loaded = load_yaml_file(project_file)
    assert loaded["name"] == password
