import os
import pytest
import datetime
import time
import os
import pytest
import datetime
import time
from textwrap import dedent
from visivo.templates.render_yaml import (
    env_var,
    now,
    to_unix,
    to_iso,
    to_str_format,
    render_yaml,
)


def test_env_var():
    # Test when environment variable exists
    os.environ["TEST_VAR"] = "test_value"
    assert env_var("TEST_VAR") == "test_value"

    # Test when environment variable does not exist

    assert env_var("NON_EXISTING_VAR") == "NOT-SET"


def test_now():
    current_time = now()
    assert current_time <= time.time()


def test_to_unix():
    # Test conversion from ISO format to UNIX timestamp
    unix_timestamp = to_unix("2022-01-01T00:00:00Z")
    assert unix_timestamp == 1640995200.0

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
