import os
import pytest
import datetime
import time
import os
import pytest
import datetime
import time
from textwrap import dedent
from tests.support.utils import temp_file, temp_folder
from visivo.templates.render_yaml import (
    env_var,
    now,
    to_unix,
    to_iso,
    to_str_format,
    render_yaml,
    read_json_file,
    timedelta,
)


def test_env_var():
    # Test when environment variable exists
    os.environ["TEST_VAR"] = "test_value"
    assert env_var("TEST_VAR") == "test_value"

    # Test when environment variable does not exist

    assert env_var("NON_EXISTING_VAR") == "NOT-SET"


class TestToIso:
    # Converts a UNIX timestamp to an ISO 8601 formatted string with a time component.
    def test_with_time_component(self):
        unix_timestamp = 1640995202.0
        iso_format = to_iso(unix_timestamp)
        assert iso_format == "2022-01-01T00:00:02+00:00"

    # Converts a UNIX timestamp to an ISO 8601 formatted string without a time component.
    def test_without_time_component(self):
        unix_timestamp = 1640995200.0
        iso_format = to_iso(unix_timestamp)
        assert iso_format == "2022-01-01"

    # Converts a UNIX timestamp with a fractional component to an ISO 8601 formatted string with a time component.
    def test_with_fractional_component(self):
        unix_timestamp = 1640995200.5
        iso_format = to_iso(unix_timestamp)
        assert iso_format == "2022-01-01T00:00:00.500000+00:00"

    # Converts a UNIX timestamp representing the earliest possible date to an ISO 8601 formatted string.
    def test_earliest_date(self):
        unix_timestamp = -86400.0
        iso_format = to_iso(unix_timestamp)
        assert iso_format == "1969-12-31"

    # Converts a UNIX timestamp representing the latest possible date to an ISO 8601 formatted string.
    def test_latest_date(self):
        unix_timestamp = 253402300799.0
        iso_format = to_iso(unix_timestamp)
        assert iso_format == "9999-12-31T23:59:59+00:00"

    # Converts a UNIX timestamp with a fractional component to an ISO 8601 formatted string without a time component.
    def test_fractional_without_time_component(self):
        unix_timestamp = 1640995200.5
        iso_format = to_iso(unix_timestamp)
        assert iso_format == "2022-01-01T00:00:00.500000+00:00"


def test_now():
    current_time = now()
    assert current_time <= time.time()


def test_to_unix():
    # Test conversion from ISO format to UNIX timestamp
    unix_timestamp = to_unix("2022-01-01T00:00:00Z")
    assert unix_timestamp == 1640995200.0

    # Test examples in docs
    unix_timestamp = to_unix("Dec 31, 2024")
    assert unix_timestamp == 1735603200.0

    unix_timestamp = to_unix("2024-01-01")
    assert unix_timestamp == 1704067200.0

    unix_timestamp = to_unix("2024/12/24 18:00")
    assert unix_timestamp == 1735063200.0

    # Test conversion from invalid date string
    with pytest.raises(ValueError):
        to_unix("invalid_date_string")


def test_to_iso():
    # Test conversion from UNIX timestamp to ISO format date
    iso_format = to_iso(1640995200.0)
    assert iso_format == "2022-01-01"
    # Test conversion from UNIX timestamp to ISO format datetime
    iso_format = to_iso(1640995202.0)
    assert iso_format == "2022-01-01T00:00:02+00:00"


def test_to_str_format():
    # Test conversion from UNIX timestamp to custom string format
    str_format = to_str_format(1640995200.0, "%Y-%m-%d %H:%M:%S")
    assert str_format == "2022-01-01 00:00:00"


# Raises a FileNotFoundError when given an invalid filepath
def test_read_json_file_invalid_filepath():
    # Arrange
    filepath = "invalid.json"

    # Act and Assert
    with pytest.raises(FileNotFoundError):
        read_json_file(filepath)


def test_read_json_file_valid_filepath():
    # Arrange

    output_dir = os.path.join(os.path.dirname(__file__), temp_folder())
    filepath = "valid.json"
    path = temp_file(contents='{"key": "value"}', name=filepath, output_dir=output_dir)

    # Act and Assert
    obj = read_json_file(path)
    assert obj == {"key": "value"}


def test_timedelta_interactions():
    template_string = "{% set datetime = to_unix('2022-01-01 00:00:00') %}{{ datetime - timedelta(days=1) }}"
    rendered_template = render_yaml(template_string)
    assert rendered_template == "1640908800.0"


def test_timedelta():
    td = timedelta(days=7)
    assert td == 604800.0


def test_timedelta_docs_example_two():
    yaml = dedent(
        """
    charts:
      - name: ranged-chart
        traces:
          - ref(trace1)
          - ref(trace2)
        layout
          xaxis:
            range:
              {%- set current_time = now() %}
              - "{{ to_iso(current_time - timedelta(days=7)) }}"
              - "{{ to_iso(current_time) }}"
    """
    )
    print(rendered)
    assert '+00:00"' in rendered


def test_render_yaml():
    # Test rendering YAML template
    template_string = "{% set name = 'Mom' %}Hello, {{ name }}!"
    rendered_template = render_yaml(template_string)
    assert rendered_template == "Hello, Mom!"

    # Test Looping
    template_string = dedent(
        """
    {%- set names = ['Mom', 'World', 'Foobars'] %}
    greetings:
      {%- for name in names %}
      - Hello, {{ name }}!
      {%- endfor %}
    """
    )
    assert (
        render_yaml(template_string)
        == "\ngreetings:\n  - Hello, Mom!\n  - Hello, World!\n  - Hello, Foobars!"
    )

    # Test Looping w/ functions
    template_string = dedent(
        """
    {%- set names = ['Mom', 'World', 'Foobars'] %}
    {%- set prev_time = now() %}
    greetings:
      {%- for name in names %}
      - message: Hello, {{ name }}!
        {%- set current_time = now() %}
        time: {{ to_iso(current_time) }}
        seconds-from-last: {{ current_time - prev_time }}
        {%- set prev_time = current_time %}
      {%- endfor %}
    """
    )
    rendered_template = render_yaml(template_string)
    assert "message: Hello, Mom!" in rendered_template
    assert "time:" in rendered_template
    assert "e-" in rendered_template
