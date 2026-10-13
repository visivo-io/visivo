import os
import re

import pytest
import yaml
from dotenv import dotenv_values

from visivo.models.base.env_var_string import EnvVarString
from visivo.server.source_credentials import ensure_env_gitignored
from visivo.models.sources.bigquery_source import BigQuerySource
from visivo.models.sources.postgresql_source import PostgresqlSource
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.defaults import Defaults
from visivo.models.project import Project
from visivo.server.views.utils import (
    _env_var_name,
    externalize_source_credentials,
    merge_env_file,
    write_project_file,
)


@pytest.fixture(autouse=True)
def restore_environ():
    """externalize_source_credentials mutates os.environ directly, so snapshot
    and restore it around every test."""
    saved = dict(os.environ)
    yield
    os.environ.clear()
    os.environ.update(saved)


def _read_env(project_dir):
    """Parse the .env exactly as python-dotenv will on the next run.

    Deliberately not a hand-rolled ``split("=")``: values are quoted and
    escaped on write, and what matters is the string a restart actually
    loads — a naive parser would happily pass on a value dotenv truncates.
    """
    return dict(dotenv_values(os.path.join(project_dir, ".env")))


def test_env_var_name_sanitizes_and_uppercases():
    assert _env_var_name("my-source", "password") == "MY_SOURCE_PASSWORD"
    assert _env_var_name("Prod DB", "username") == "PROD_DB_USERNAME"
    assert _env_var_name("__weird__", "password") == "WEIRD_PASSWORD"


@pytest.mark.parametrize(
    "source_name",
    [
        "my-source",
        "Prod DB",
        "__weird__",
        "2024_warehouse",  # a leading digit is legal in a source name
        "9",
        "café",  # \W is unicode-aware, so accented letters used to survive
        "日本語",  # nothing ASCII at all
        "-",  # collapses to nothing
    ],
)
def test_env_var_name_is_always_referenceable(source_name):
    """The generated name has to survive ENV_VAR_CONTEXT_PATTERN, or the
    ${env.*} reference stored in the YAML resolves to nothing and the source
    authenticates with the literal reference string."""
    name = _env_var_name(source_name, "password")

    assert re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", name), name
    assert EnvVarString(f"${{env.{name}}}").get_env_var_names() == [name]


@pytest.mark.parametrize(
    "secret",
    [
        "hunter2",
        "Passw0rd #1",
        "trailing ",
        " leading",
        '"double"',
        "'single'",
        "p${a}ss",
        "back\\slash",
        "multi\nline\nvalue",
        "carriage\r\nreturn",
        "tab\there",
        "a=b=c",
        "",
    ],
    ids=repr,
)
def test_merge_env_file_round_trips_awkward_values(tmp_path, secret):
    """Whatever goes into .env must come back out of dotenv unchanged — the
    .env line is the only remaining copy of an externalized credential."""
    merge_env_file(str(tmp_path), {"SECRET": secret, "AFTER": "sentinel"})

    values = _read_env(str(tmp_path))
    assert values["SECRET"] == secret
    # A newline in the value must not turn the rest of the file into garbage.
    assert values["AFTER"] == "sentinel"


def test_ensure_env_gitignored_is_idempotent(tmp_path):
    ensure_env_gitignored(str(tmp_path))
    ensure_env_gitignored(str(tmp_path))

    assert (tmp_path / ".gitignore").read_text() == ".env\n"


def test_ensure_env_gitignored_without_a_project_dir_writes_nothing(tmp_path, monkeypatch):
    """No project dir means no known project to write into — never the cwd."""
    monkeypatch.chdir(tmp_path)

    ensure_env_gitignored(None)

    assert not (tmp_path / ".gitignore").exists()


def test_merge_env_file_creates_and_upserts(tmp_path):
    project_dir = str(tmp_path)
    (tmp_path / ".env").write_text("# a comment\nEXISTING=keep\nMY_SOURCE_PASSWORD=old\n")

    merge_env_file(project_dir, {"MY_SOURCE_PASSWORD": "new", "OTHER_USERNAME": "svc"})

    values = _read_env(project_dir)
    assert values["MY_SOURCE_PASSWORD"] == "new"  # updated in place
    assert values["EXISTING"] == "keep"  # untouched
    assert values["OTHER_USERNAME"] == "svc"  # appended
    # the comment survives the merge (no clobber)
    assert "# a comment" in (tmp_path / ".env").read_text()


def test_merge_env_file_noop_on_empty(tmp_path):
    project_dir = str(tmp_path)
    merge_env_file(project_dir, {})
    assert not (tmp_path / ".env").exists()


def test_externalize_postgres_moves_password_and_username(tmp_path):
    project_dir = str(tmp_path)
    source = PostgresqlSource(
        name="warehouse",
        type="postgresql",
        host="db.internal",
        database="analytics",
        username="admin",
        password="hunter2",
    )

    source_dict = externalize_source_credentials(source, project_dir)

    # YAML-bound dict references env, never the real secret
    assert source_dict["password"] == "${env.WAREHOUSE_PASSWORD}"
    assert source_dict["username"] == "${env.WAREHOUSE_USERNAME}"
    assert "hunter2" not in yaml.dump(source_dict)
    assert "admin" not in source_dict["username"]

    # .env holds the real values
    values = _read_env(project_dir)
    assert values["WAREHOUSE_PASSWORD"] == "hunter2"
    assert values["WAREHOUSE_USERNAME"] == "admin"

    # loaded into the running process so ${env.*} resolves immediately (the bug)
    assert os.environ["WAREHOUSE_PASSWORD"] == "hunter2"
    assert os.environ["WAREHOUSE_USERNAME"] == "admin"


def test_externalize_bigquery_moves_credentials_base64(tmp_path):
    project_dir = str(tmp_path)
    source = BigQuerySource(
        name="bq",
        type="bigquery",
        project="my-project",
        database="my_dataset",
        credentials_base64="c2VjcmV0LWtleQ==",
    )

    source_dict = externalize_source_credentials(source, project_dir)

    assert source_dict["credentials_base64"] == "${env.BQ_CREDENTIALS_BASE64}"
    assert _read_env(project_dir)["BQ_CREDENTIALS_BASE64"] == "c2VjcmV0LWtleQ=="
    assert os.environ["BQ_CREDENTIALS_BASE64"] == "c2VjcmV0LWtleQ=="


def test_externalize_drops_empty_password_without_masking(tmp_path):
    project_dir = str(tmp_path)
    source = PostgresqlSource(
        name="nopass",
        type="postgresql",
        host="db.internal",
        database="analytics",
        username="admin",
        password="",
    )

    source_dict = externalize_source_credentials(source, project_dir)

    # An empty secret must not leak as a masked "**********" literal
    assert "password" not in source_dict
    assert source_dict["username"] == "${env.NOPASS_USERNAME}"


def test_externalize_leaves_existing_env_ref_untouched(tmp_path):
    project_dir = str(tmp_path)
    source = PostgresqlSource(
        name="ref",
        type="postgresql",
        host="db.internal",
        database="analytics",
        username="admin",
        password="${env.PRESET_PASSWORD}",
    )

    source_dict = externalize_source_credentials(source, project_dir)

    assert source_dict["password"] == "${env.PRESET_PASSWORD}"
    # a pre-existing ref is not re-written into .env under a new name
    assert not os.path.exists(os.path.join(project_dir, ".env")) or (
        "PRESET_PASSWORD" not in _read_env(project_dir)
    )


def test_externalize_noop_for_credential_free_source(tmp_path):
    project_dir = str(tmp_path)
    source = SqliteSource(name="s", type="sqlite", database="local.db")

    source_dict = externalize_source_credentials(source, project_dir)

    assert source_dict["database"] == "local.db"
    assert not (tmp_path / ".env").exists()


def test_write_project_file_keeps_env_refs_and_no_mask(tmp_path):
    project_dir = str(tmp_path)
    source = {
        "name": "warehouse",
        "type": "postgresql",
        "host": "db.internal",
        "database": "analytics",
        "username": "${env.WAREHOUSE_USERNAME}",
        "password": "${env.WAREHOUSE_PASSWORD}",
    }
    project = Project(
        name="p",
        defaults=Defaults(source_name="warehouse"),
        sources=[source],
    )

    write_project_file(project, project_dir)

    written = (tmp_path / "project.visivo.yml").read_text()
    assert "${env.WAREHOUSE_PASSWORD}" in written
    assert "${env.WAREHOUSE_USERNAME}" in written
    assert "**********" not in written
