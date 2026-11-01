from visivo.frozen import is_frozen


class TestIsFrozen:
    """The three markers, pinned without needing a real frozen build."""

    def test_a_pip_install_is_not_frozen(self):
        assert is_frozen() is False

    def test_pyinstaller_sets_sys_frozen(self, monkeypatch):
        monkeypatch.setattr("sys.frozen", True, raising=False)
        assert is_frozen() is True

    def test_pyinstaller_onedir_unpacks_to_meipass(self, monkeypatch):
        monkeypatch.setattr("sys._MEIPASS", "/tmp/_MEI123", raising=False)
        assert is_frozen() is True

    def test_nuitka_defines_compiled_in_the_module(self, monkeypatch):
        import visivo.frozen

        monkeypatch.setitem(visivo.frozen.__dict__, "__compiled__", object())
        assert is_frozen() is True
