"""Row values Flask's jsonify would render in a form Plotly rejects."""

import datetime
import importlib.util

from visivo.server.temporal_json import isoformat_temporal_values


def test_temporal_values_become_iso_strings():
    rows = [
        {
            "ts": datetime.datetime(2026, 6, 1, 12, 30),
            "d": datetime.date(2026, 6, 1),
            "t": datetime.time(12, 30),
            "span": datetime.timedelta(days=1, seconds=5),
            "n": 1,
            "s": "x",
        }
    ]

    assert isoformat_temporal_values(rows) == [
        {
            "ts": "2026-06-01T12:30:00",
            "d": "2026-06-01",
            "t": "12:30:00",
            "span": "1 day, 0:00:05",
            "n": 1,
            "s": "x",
        }
    ]
    assert isoformat_temporal_values([]) == []


def test_it_no_longer_lives_under_views():
    assert importlib.util.find_spec("visivo.server.views.temporal_json") is None
