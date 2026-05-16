"""Tests for the Defaults model."""

from visivo.models.defaults import Defaults


class TestDefaultsDraftMode:
    """Tests for draft_mode_enabled field on Defaults."""

    def test_defaults_accepts_draft_mode_enabled_true(self):
        """Defaults should accept draft_mode_enabled=True."""
        defaults = Defaults(draft_mode_enabled=True)
        assert defaults.draft_mode_enabled is True

    def test_defaults_accepts_draft_mode_enabled_false(self):
        """Defaults should accept draft_mode_enabled=False."""
        defaults = Defaults(draft_mode_enabled=False)
        assert defaults.draft_mode_enabled is False

    def test_defaults_accepts_draft_mode_enabled_none(self):
        """Defaults should accept draft_mode_enabled=None (default unspecified)."""
        defaults = Defaults(draft_mode_enabled=None)
        assert defaults.draft_mode_enabled is None

    def test_defaults_default_for_draft_mode_is_none(self):
        """When draft_mode_enabled is not provided, the field defaults to None."""
        defaults = Defaults()
        assert defaults.draft_mode_enabled is None

    def test_defaults_serializes_draft_mode_enabled(self):
        """draft_mode_enabled is serialized when not None."""
        defaults = Defaults(draft_mode_enabled=True)
        dump = defaults.model_dump(exclude_none=True)
        assert dump.get("draft_mode_enabled") is True

    def test_defaults_omits_draft_mode_when_none(self):
        """draft_mode_enabled is omitted from exclude_none dump when None."""
        defaults = Defaults(draft_mode_enabled=None)
        dump = defaults.model_dump(exclude_none=True)
        assert "draft_mode_enabled" not in dump
