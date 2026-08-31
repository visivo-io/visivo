"""One definition of "is debug on": DEBUG must be exactly "true".

The hot-reload server used to test mere presence (`os.environ.get("DEBUG")`),
so DEBUG=false turned the werkzeug/socketio access-log flood ON — the
opposite of what the value says, and inconsistent with Logger.debug.
"""

from visivo.logger.logger import is_debug


def test_unset_is_off(monkeypatch):
    monkeypatch.delenv("DEBUG", raising=False)
    assert is_debug() is False


def test_false_is_off(monkeypatch):
    monkeypatch.setenv("DEBUG", "false")
    assert is_debug() is False


def test_arbitrary_truthy_string_is_off(monkeypatch):
    monkeypatch.setenv("DEBUG", "1")
    assert is_debug() is False


def test_true_is_on(monkeypatch):
    monkeypatch.setenv("DEBUG", "true")
    assert is_debug() is True
