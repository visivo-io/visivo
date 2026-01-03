"""Tests for the environment variable resolver module."""

import os
import pytest
from visivo.parsers.env_var_resolver import (
    MissingEnvVarError,
    extract_env_var_refs,
    resolve_env_vars,
    has_env_var_refs,
)


class TestExtractEnvVarRefs:
    """Tests for extract_env_var_refs function."""

    def test_extract_single_env_var(self):
        content = "password: ${env.DB_PASSWORD}"
        refs = extract_env_var_refs(content)
        assert refs == {"DB_PASSWORD"}

    def test_extract_multiple_env_vars(self):
        content = "host: ${env.DB_HOST}, password: ${env.DB_PASSWORD}"
        refs = extract_env_var_refs(content)
        assert refs == {"DB_HOST", "DB_PASSWORD"}

    def test_extract_with_whitespace(self):
        content = "value: ${ env.MY_VAR }"
        refs = extract_env_var_refs(content)
        assert refs == {"MY_VAR"}

    def test_extract_empty_string(self):
        refs = extract_env_var_refs("")
        assert refs == set()

    def test_extract_no_env_vars(self):
        content = "host: localhost, password: secret"
        refs = extract_env_var_refs(content)
        assert refs == set()

    def test_extract_ignores_regular_refs(self):
        content = "${ref(model_name)} and ${env.API_KEY}"
        refs = extract_env_var_refs(content)
        assert refs == {"API_KEY"}

    def test_extract_underscores_and_numbers(self):
        content = "${env.MY_VAR_123}"
        refs = extract_env_var_refs(content)
        assert refs == {"MY_VAR_123"}

    def test_extract_starts_with_underscore(self):
        content = "${env._PRIVATE_VAR}"
        refs = extract_env_var_refs(content)
        assert refs == {"_PRIVATE_VAR"}


class TestResolveEnvVars:
    """Tests for resolve_env_vars function."""

    def test_resolve_single_env_var(self, monkeypatch):
        monkeypatch.setenv("TEST_VAR", "test_value")
        content = "value: ${env.TEST_VAR}"
        result = resolve_env_vars(content)
        assert result == "value: test_value"

    def test_resolve_multiple_env_vars(self, monkeypatch):
        monkeypatch.setenv("HOST", "localhost")
        monkeypatch.setenv("PORT", "5432")
        content = "postgres://${env.HOST}:${env.PORT}/db"
        result = resolve_env_vars(content)
        assert result == "postgres://localhost:5432/db"

    def test_resolve_with_whitespace(self, monkeypatch):
        monkeypatch.setenv("MY_VAR", "value")
        content = "${ env.MY_VAR }"
        result = resolve_env_vars(content)
        assert result == "value"

    def test_resolve_missing_raises(self):
        content = "value: ${env.NONEXISTENT_VAR}"
        with pytest.raises(MissingEnvVarError) as exc_info:
            resolve_env_vars(content)
        assert "NONEXISTENT_VAR" in str(exc_info.value)
        assert exc_info.value.var_name == "NONEXISTENT_VAR"

    def test_resolve_missing_with_context(self):
        content = "value: ${env.MISSING_VAR}"
        with pytest.raises(MissingEnvVarError) as exc_info:
            resolve_env_vars(content, context="my_file.yaml")
        assert "MISSING_VAR" in str(exc_info.value)
        assert "my_file.yaml" in str(exc_info.value)

    def test_resolve_preserves_other_content(self, monkeypatch):
        monkeypatch.setenv("API_KEY", "secret123")
        content = """
name: my-project
sources:
  - name: api
    api_key: ${env.API_KEY}
    url: https://api.example.com
"""
        result = resolve_env_vars(content)
        assert "secret123" in result
        assert "https://api.example.com" in result
        assert "${env" not in result

    def test_resolve_ignores_regular_refs(self, monkeypatch):
        monkeypatch.setenv("VAR", "value")
        content = "${ref(model)} and ${env.VAR}"
        result = resolve_env_vars(content)
        assert result == "${ref(model)} and value"

    def test_resolve_empty_string(self):
        result = resolve_env_vars("")
        assert result == ""

    def test_resolve_no_env_vars(self):
        content = "no env vars here"
        result = resolve_env_vars(content)
        assert result == content


class TestHasEnvVarRefs:
    """Tests for has_env_var_refs function."""

    def test_has_env_var_refs_true(self):
        assert has_env_var_refs("${env.MY_VAR}")

    def test_has_env_var_refs_false(self):
        assert not has_env_var_refs("no env vars")

    def test_has_env_var_refs_empty(self):
        assert not has_env_var_refs("")

    def test_has_env_var_refs_none(self):
        assert not has_env_var_refs(None)


class TestMissingEnvVarError:
    """Tests for MissingEnvVarError exception."""

    def test_error_message_basic(self):
        error = MissingEnvVarError("MY_VAR")
        assert "MY_VAR" in str(error)
        assert "not set" in str(error)

    def test_error_message_with_context(self):
        error = MissingEnvVarError("MY_VAR", context="config.yaml")
        assert "MY_VAR" in str(error)
        assert "config.yaml" in str(error)

    def test_error_attributes(self):
        error = MissingEnvVarError("MY_VAR", context="file.yaml")
        assert error.var_name == "MY_VAR"
        assert error.context == "file.yaml"
