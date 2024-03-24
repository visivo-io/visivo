import time
import datetime
from dateutil import parser
import jinja2
import os


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
    """
    date_obj = parser.parse(date_str)

    if date_obj.tzinfo is None or date_obj.tzinfo.utcoffset(date_obj) is None:
        date_obj = date_obj.replace(tzinfo=datetime.timezone.utc)

    return date_obj.timestamp()


def to_iso(unix_timestamp: float):

    date_obj = datetime.utcfromtimestamp(unix_timestamp)

    if date_obj.hour == 0 and date_obj.minute == 0 and date_obj.second == 0:
        return date_obj.date().isoformat()
    else:
        return date_obj.isoformat() + "Z"


def to_str_format(unix_timestamp: float, str_format: str):
    date_obj = datetime.utcfromtimestamp(unix_timestamp)
    return date_obj.strftime(str_format)


FUNCTIONS = {
    "env_var": env_var,
    "now": now,
    "timedelta": datetime.timedelta,
    "to_unix": to_unix,
    "to_iso": to_iso,
    "to_str_format": to_str_format,
}


def render_yaml(template_string: str):
    template = jinja2.Template(template_string)
    return template.render(FUNCTIONS)
