import time
import datetime
from dateutil import parser
import jinja2
import os
import json


def env_var(key):
    return os.getenv(key, "NOT-SET").replace("\\", "\\\\").replace('"', '\\"')


def now():
    return time.time()


def to_unix(date_str: str) -> float:
    """
    Accepts a string that represents a date or date & time and returns the UTC unix timestamp. Able to parse a wide range of
    different formats.

    The function attempts to be forgiving with regards to unlikely input formats,
    returning a datetime object even for dates which are ambiguous. If an element
    of a date/time stamp is omitted, the following rules are applied:

    - If AM or PM is left unspecified, a 24-hour clock is assumed, however, an hour
        on a 12-hour clock (``0 <= hour <= 12``) *must* be specified if AM or PM is
        specified.
    - If a time zone is omitted UTC is assumed.

    Args:
        date_str (str): The string representing the date or date & time.

    Returns:
        float: The UTC unix timestamp.
    """
    date_obj = parser.parse(date_str)

    if date_obj.tzinfo is None or date_obj.tzinfo.utcoffset(date_obj) is None:
        date_obj = date_obj.replace(tzinfo=datetime.timezone.utc)

    return date_obj.timestamp()


def to_iso(unix_timestamp: float):
    """
    Converts a UTC unix timestamp to an ISO 8601 formatted string.

    If the timestamp represents a date only (with no time component), the resulting
    string will be in the format 'YYYY-MM-DD'. Otherwise, the resulting string will
    be in the format 'YYYY-MM-DDTHH:MM:SSZ', where 'T' separates the date and time,
    and 'Z' indicates UTC time.

    Args:
        unix_timestamp (float): The UTC unix timestamp.

    Returns:
        str: The ISO 8601 formatted string.
    """
    date_obj = datetime.datetime.fromtimestamp(unix_timestamp, datetime.timezone.utc)
    if (
        date_obj.hour == 0
        and date_obj.minute == 0
        and date_obj.second == 0
        and date_obj.microsecond == 0
    ):
        return date_obj.date().isoformat()
    else:
        return date_obj.isoformat()


def to_str_format(unix_timestamp: float, str_format: str):
    """
    Converts a UTC unix timestamp to a string using the specified format.

    The format string should follow the directives of the Python `strftime` function.

    Args:
        unix_timestamp (float): The UTC unix timestamp.
        str_format (str): The format string.

    Returns:
        str: The formatted string.
    """
    date_obj = datetime.datetime.fromtimestamp(unix_timestamp, datetime.timezone.utc)
    return date_obj.strftime(str_format)


def read_json_file(filepath):
    """Read and parse a JSON file, returning a Python object.

    The filepath can be either relative to the script or module this function
    is defined in, or an absolute path.
    """
    # Check if the filepath is absolute. If not, treat it as relative to BASE_DIR.
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    if not os.path.isabs(filepath):
        filepath = os.path.join(BASE_DIR, filepath)

    if not os.path.isfile(filepath):
        raise FileNotFoundError(f"File not found at: {filepath}")

    with open(filepath, "r") as file:
        data = json.load(file)
    return data


def timedelta(**kwargs):
    td = datetime.timedelta(**kwargs)
    return td.total_seconds()


FUNCTIONS = {
    "env_var": env_var,
    "now": now,
    "timedelta": timedelta,
    "to_unix": to_unix,
    "to_iso": to_iso,
    "to_str_format": to_str_format,
    "read_json_file": read_json_file,
}


def render_yaml(template_string: str):
    """
    Renders a YAML template string using Jinja2 and a set of predefined functions.

    Args:
        template_string (str): The YAML template string to render.

    Returns:
        str: The rendered YAML string.
    """
    template = jinja2.Template(template_string)
    return template.render(FUNCTIONS)
