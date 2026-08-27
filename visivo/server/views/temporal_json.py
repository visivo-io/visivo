"""Temporal-value serialisation for row payloads.

Left to Flask, ``jsonify`` renders ``datetime`` as RFC-1123
("Mon, 01 Jun 2026 00:00:00 GMT"), which Plotly's date parser rejects — the
axis then autotypes as category in row order (B7-b / S2-19) — and crashes
outright on ``timedelta`` (a DuckDB INTERVAL column → raw 500). Every view
that returns query rows routes them through here first.
"""

import datetime


def isoformat_temporal_values(rows):
    """Return rows with datetime/date/time values as ISO-8601 strings and
    timedelta values as their string form."""
    converted = []
    for row in rows:
        out = {}
        for key, value in row.items():
            if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
                out[key] = value.isoformat()
            elif isinstance(value, datetime.timedelta):
                out[key] = str(value)
            else:
                out[key] = value
        converted.append(out)
    return converted
