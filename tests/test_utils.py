from tests.support.utils import temp_file
from visivo.utils import *
import datetime
import sys


def test_listify():
    assert listify("string") == ["string"]
    assert listify(["string1", "string2"]) == ["string1", "string2"]


def test_yml_to_dict():
    func_recturn = yml_to_dict("tests/fixtures/test_yml_to_dict.yml")
    expected_return = {"this": ["is", "a", "yaml"], "file": "to read"}
    assert expected_return == func_recturn

    response = yml_to_dict("tests/fixtures/folder_with_yamls/nested_folder/nested_yaml_file.yaml")
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

    loaded = load_config_file(project_file)
    assert loaded["name"] == password


def test_nested_dict_from_dotted_keys():
    flat_dict = {
        "a.b.c": 1,
        "a.b.d": 2,
        "a.e": 3,
        "f": 4,
    }
    assert nested_dict_from_dotted_keys(flat_dict) == {
        "a": {"b": {"c": 1, "d": 2}, "e": 3},
        "f": 4,
    }

    flat_dict = {
        "top": {
            "a.b.c": 1,
            "a.b.d": 2,
            "a.e": 3,
            "f": 4,
        }
    }
    assert nested_dict_from_dotted_keys(flat_dict) == {
        "top": {
            "a": {"b": {"c": 1, "d": 2}, "e": 3},
            "f": 4,
        }
    }


def test_merge_dicts():
    dict1 = {"a": 1, "b": 2, "c": {"d": 3, "e": 4}}
    dict2 = {"b": 20, "c": {"e": 40, "f": 50}, "g": 60}
    assert merge_dicts(dict1, dict2) == {
        "a": 1,
        "b": 20,
        "c": {"d": 3, "e": 40, "f": 50},
        "g": 60,
    }


def test_combine_dict_properties():
    input_dict = {
        "a": {"b": [1], "c": 2},
        "d": {"b": 3, "c": [4]},
        "e": {"b": 5, "c": 6},
    }
    expected_output = {"b": [1, 3, 5], "c": [2, 4, 6]}
    assert combine_dict_properties(input_dict) == expected_output


def test_get_utc_now_returns_timezone_aware_datetime():
    """Test that get_utc_now returns a timezone-aware datetime object."""
    result = get_utc_now()

    # Check that it's a datetime object
    assert isinstance(result, datetime.datetime)

    # Check that it has timezone info
    assert result.tzinfo is not None

    # Check that it's UTC timezone
    assert result.tzinfo == datetime.timezone.utc


def test_get_utc_now_is_recent():
    """Test that get_utc_now returns a recent datetime (within last few seconds)."""
    before = datetime.datetime.now(datetime.timezone.utc)
    result = get_utc_now()
    after = datetime.datetime.now(datetime.timezone.utc)

    # Should be between before and after
    assert before <= result <= after

    # Should be within a reasonable time window (1 second)
    assert (after - result).total_seconds() < 1.0


def test_get_utc_now_isoformat():
    """Test that get_utc_now works with isoformat (the main use case)."""
    result = get_utc_now()
    iso_string = result.isoformat()

    # Should be a valid ISO format string
    assert isinstance(iso_string, str)

    # Should contain timezone info (either +00:00 or Z)
    assert "+00:00" in iso_string or "Z" in iso_string or iso_string.endswith("+00:00")


def test_get_utc_now_consistency():
    """Test that multiple calls to get_utc_now are consistent."""
    result1 = get_utc_now()
    result2 = get_utc_now()

    # Both should be timezone-aware
    assert result1.tzinfo == datetime.timezone.utc
    assert result2.tzinfo == datetime.timezone.utc

    # Second call should be after or equal to first
    assert result2 >= result1

    # Should be very close in time (within 1 second)
    assert (result2 - result1).total_seconds() < 1.0
