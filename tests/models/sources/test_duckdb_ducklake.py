import os
import shutil
import socket
import subprocess
import time
import uuid

import click
import duckdb
import pytest
from pydantic import ValidationError

from visivo.models.sources.database_file import is_file_database
from visivo.models.sources.duckdb_source import DuckdbAttachment, DuckdbSource
from visivo.models.sources.ducklake import (
    DuckLakeAttachment,
    attach_database_sql,
    quote_identifier,
    quote_literal,
    redact,
)

PASSWORD = "pg-pass-9f3'k"
HMAC_SECRET = "hmac-secret-71c2"
HMAC_KEY_ID = "GOOG1EXAMPLEKEYID"


def _postgres_lake(**overrides):
    config = {
        "catalog": {
            "host": "db.example.com",
            "database": "ducklake",
            "username": "reader",
            "password": PASSWORD,
        },
        "data_path": "gs://bucket/lake/",
        "gcs": {"key_id": HMAC_KEY_ID, "secret": HMAC_SECRET},
    }
    config.update(overrides)
    return config


def _source(ducklake, schema_name="lake", **kwargs):
    return DuckdbSource(
        name="lake_source",
        type="duckdb",
        database=":memory:",
        attach=[{"schema_name": schema_name, "ducklake": ducklake}],
        **kwargs,
    )


def _extension_available(name):
    try:
        with duckdb.connect(":memory:") as connection:
            connection.execute(f"INSTALL {name}")
            connection.execute(f"LOAD {name}")
        return True
    except Exception:
        return False


needs_ducklake = pytest.mark.skipif(
    not _extension_available("ducklake"), reason="DuckDB ducklake extension is not installed"
)


def _create_lake(tmp_path, catalog_file="catalog.ducklake"):
    catalog_uri = f"ducklake:{tmp_path / catalog_file}"
    data_path = tmp_path / "lake_data"
    with duckdb.connect(":memory:") as connection:
        connection.execute(f"ATTACH '{catalog_uri}' AS lake (DATA_PATH '{data_path}/')")
        connection.execute(
            "CREATE TABLE lake.main.orders AS "
            "SELECT * FROM (VALUES ('east', 10), ('west', 20), ('east', 5)) AS t(region, amount)"
        )
        first = connection.execute("SELECT max(snapshot_id) FROM lake.snapshots()").fetchone()[0]
        connection.execute("INSERT INTO lake.main.orders VALUES ('north', 100)")
    return catalog_uri, first


# --- Model validation -------------------------------------------------------


def test_a_postgres_and_gcs_ducklake_is_valid_and_read_only_by_default():
    lake = DuckLakeAttachment(**_postgres_lake())

    assert lake.read_only is True
    assert lake.snapshot_version is None
    assert lake.catalog.port == 5432
    assert lake.catalog.type == "postgres"


def test_a_file_catalog_uri_is_valid():
    lake = DuckLakeAttachment(catalog="ducklake:sqlite:local/catalog.sqlite")

    assert lake.catalog == "ducklake:sqlite:local/catalog.sqlite"
    assert lake.data_path is None


@pytest.mark.parametrize(
    "config, message",
    [
        ({"catalog": "local/catalog.sqlite"}, "catalog must be a 'ducklake:' URI"),
        ({"catalog": "ducklake:"}, "catalog must be a 'ducklake:' URI"),
        (
            {"catalog": "ducklake:postgres:dbname=lake password=hunter2"},
            "A Postgres catalog must use the catalog fields",
        ),
        (
            {"catalog": "ducklake:c.ducklake", "read_only": False, "snapshot_version": 3},
            "snapshot_version needs read_only: true",
        ),
        ({"catalog": "ducklake:c.ducklake", "snapshot_version": -1}, "greater than or equal to 0"),
        (_postgres_lake(data_path="s3://bucket/lake/"), "starts with 'gs://' or 'gcs://'"),
        (_postgres_lake(gcs={"key_id": HMAC_KEY_ID}), "Field required"),
        (_postgres_lake(catalog={"host": "h", "database": "d"}), "Field required"),
        (_postgres_lake(catalog={"host": "h", "database": "d", "user": "u"}), "Extra inputs"),
        (_postgres_lake(init_sql="DROP TABLE x"), "Extra inputs"),
    ],
)
def test_a_bad_ducklake_is_refused(config, message):
    with pytest.raises(ValidationError, match=message):
        DuckLakeAttachment(**config)


def test_a_refused_catalog_uri_does_not_repeat_its_password():
    with pytest.raises(ValidationError) as error:
        DuckdbSource(
            name="s",
            type="duckdb",
            database=":memory:",
            attach=[
                {
                    "schema_name": "lake",
                    "ducklake": {"catalog": "ducklake:postgres:dbname=lake password=hunter2"},
                }
            ],
        )

    assert "hunter2" not in str(error.value.errors(include_input=False))


@pytest.mark.parametrize(
    "schema_name", ["lake; DROP TABLE x", 'la"ke', "1lake", "my lake", "", "a'b"]
)
def test_an_attachment_schema_name_must_be_an_identifier(schema_name):
    with pytest.raises(ValidationError, match="schema_name must start with a letter"):
        DuckdbAttachment(schema_name=schema_name, ducklake={"catalog": "ducklake:c.ducklake"})


def test_an_attachment_needs_exactly_one_of_source_or_ducklake():
    with pytest.raises(ValidationError, match="exactly one of 'source' or 'ducklake'"):
        DuckdbAttachment(schema_name="lake")
    with pytest.raises(ValidationError, match="exactly one of 'source' or 'ducklake'"):
        DuckdbAttachment(
            schema_name="lake",
            source={"name": "o", "type": "duckdb", "database": "o.duckdb"},
            ducklake={"catalog": "ducklake:c.ducklake"},
        )


def test_secrets_are_not_in_the_repr_or_the_dump():
    source = _source(_postgres_lake())

    for text in (repr(source), str(source), source.model_dump_json(), str(source.model_dump())):
        assert PASSWORD not in text
        assert HMAC_SECRET not in text


def test_the_project_schema_describes_the_ducklake_attachment():
    from visivo.parsers.schema_generator import generate_schema
    import json

    definitions = json.loads(generate_schema())["$defs"]

    assert "ducklake" in definitions["DuckdbAttachment"]["properties"]
    assert set(definitions["DuckLakeAttachment"]["properties"]) >= {
        "catalog",
        "data_path",
        "read_only",
        "snapshot_version",
        "gcs",
    }
    assert definitions["DuckLakeAttachment"]["properties"]["read_only"]["default"] is True


# --- SQL generation ---------------------------------------------------------


def test_quote_literal_escapes_quotes_and_refuses_control_characters():
    assert quote_literal("it's", "f") == "'it''s'"
    assert quote_literal("x'; DROP TABLE t; --", "f") == "'x''; DROP TABLE t; --'"
    for bad in ("a\x00b", "a\nb"):
        with pytest.raises(ValueError, match="f must not contain control characters"):
            quote_literal(bad, "f")


def test_quote_identifier_refuses_anything_but_a_plain_name():
    assert quote_identifier("lake_1") == '"lake_1"'
    for bad in ('a"b', "a b", "a;b", "", None):
        with pytest.raises(ValueError):
            quote_identifier(bad)


def test_attach_database_sql_quotes_the_path_and_the_alias():
    assert attach_database_sql("data/o'k.duckdb", "other") == (
        """ATTACH 'data/o''k.duckdb' AS "other\""""
    )


def test_a_postgres_and_gcs_ducklake_emits_secrets_then_a_read_only_attach():
    statements = DuckLakeAttachment(**_postgres_lake(snapshot_version=4)).setup_statements("lake")

    assert statements == [
        'CREATE OR REPLACE TEMPORARY SECRET "visivo_lake_catalog" (TYPE postgres, '
        "HOST 'db.example.com', PORT 5432, DATABASE 'ducklake', USER 'reader', "
        "PASSWORD 'pg-pass-9f3''k')",
        'CREATE OR REPLACE TEMPORARY SECRET "visivo_lake_storage" (TYPE gcs, '
        f"KEY_ID '{HMAC_KEY_ID}', SECRET '{HMAC_SECRET}', SCOPE 'gs://bucket/lake/')",
        "ATTACH 'ducklake:postgres:' AS \"lake\" (META_SECRET 'visivo_lake_catalog', "
        "DATA_PATH 'gs://bucket/lake/', READ_ONLY, SNAPSHOT_VERSION 4)",
    ]


def test_the_attach_statement_holds_no_credential():
    attach = DuckLakeAttachment(**_postgres_lake()).setup_statements("lake")[-1]

    assert PASSWORD.replace("'", "''") not in attach
    assert HMAC_SECRET not in attach
    assert "reader" not in attach


def test_a_writable_ducklake_without_a_data_path_or_a_password():
    lake = DuckLakeAttachment(
        catalog={"host": "h", "port": 6543, "database": "d", "username": "u"},
        read_only=False,
    )

    assert lake.setup_statements("lake") == [
        'CREATE OR REPLACE TEMPORARY SECRET "visivo_lake_catalog" (TYPE postgres, '
        "HOST 'h', PORT 6543, DATABASE 'd', USER 'u')",
        "ATTACH 'ducklake:postgres:' AS \"lake\" (META_SECRET 'visivo_lake_catalog')",
    ]


def test_a_gcs_secret_without_a_data_path_has_no_scope():
    statements = DuckLakeAttachment(**_postgres_lake(data_path=None)).setup_statements("lake")

    assert statements[1].endswith(f"SECRET '{HMAC_SECRET}')")
    assert "DATA_PATH" not in statements[2]


def test_a_uri_catalog_emits_one_attach():
    lake = DuckLakeAttachment(catalog="ducklake:sqlite:c'at.sqlite", data_path="data/")

    assert lake.setup_statements("lake") == [
        "ATTACH 'ducklake:sqlite:c''at.sqlite' AS \"lake\" (DATA_PATH 'data/', READ_ONLY)"
    ]


def test_injection_through_a_value_stays_inside_the_literal():
    lake = DuckLakeAttachment(
        catalog={
            "host": "h', PORT 1); ATTACH 'evil' AS e; --",
            "database": "d",
            "username": "u",
        }
    )

    secret = lake.setup_statements("lake")[0]

    assert "HOST 'h'', PORT 1); ATTACH ''evil'' AS e; --'" in secret


# --- Env var resolution -----------------------------------------------------


def test_env_vars_resolve_at_connect_time_not_at_parse_time(monkeypatch):
    for name in ("LAKE_HOST", "LAKE_PORT", "LAKE_PASSWORD", "LAKE_PATH", "LAKE_KEY", "LAKE_SECRET"):
        monkeypatch.delenv(name, raising=False)
    lake = DuckLakeAttachment(
        catalog={
            "host": "${env.LAKE_HOST}",
            "port": "${env.LAKE_PORT}",
            "database": "ducklake",
            "username": "reader",
            "password": "${env.LAKE_PASSWORD}",
        },
        data_path="${env.LAKE_PATH}",
        gcs={"key_id": "${env.LAKE_KEY}", "secret": "${env.LAKE_SECRET}"},
    )
    assert "${env.LAKE_PASSWORD}" in lake.model_dump_json()

    monkeypatch.setenv("LAKE_HOST", "pg.internal")
    monkeypatch.setenv("LAKE_PORT", "6432")
    monkeypatch.setenv("LAKE_PASSWORD", "from-env-pw")
    monkeypatch.setenv("LAKE_PATH", "gs://env-bucket/lake/")
    monkeypatch.setenv("LAKE_KEY", "GOOGENV")
    monkeypatch.setenv("LAKE_SECRET", "from-env-secret")
    statements = lake.setup_statements("lake")

    assert "HOST 'pg.internal', PORT 6432" in statements[0]
    assert "PASSWORD 'from-env-pw'" in statements[0]
    assert "KEY_ID 'GOOGENV', SECRET 'from-env-secret', SCOPE 'gs://env-bucket/lake/'" in (
        statements[1]
    )
    assert "DATA_PATH 'gs://env-bucket/lake/'" in statements[2]
    assert set(lake.secret_values()) == {"from-env-pw", "from-env-secret", "GOOGENV"}


@pytest.mark.parametrize(
    "env, message",
    [
        ({"LAKE_PORT": "not-a-port"}, "catalog port is not an integer"),
        ({"LAKE_PORT": "70000"}, "catalog port must be between 1 and 65535"),
        ({"LAKE_CATALOG": "ducklake:postgres:dbname=x"}, "must use the catalog fields"),
        ({"LAKE_PATH": "s3://bucket/"}, "starts with 'gs://' or 'gcs://'"),
    ],
)
def test_a_resolved_value_is_validated_again(monkeypatch, env, message):
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    if "LAKE_CATALOG" in env:
        lake = DuckLakeAttachment(catalog="${env.LAKE_CATALOG}")
    elif "LAKE_PATH" in env:
        lake = DuckLakeAttachment(**_postgres_lake(data_path="${env.LAKE_PATH}"))
    else:
        lake = DuckLakeAttachment(
            catalog={"host": "h", "port": "${env.LAKE_PORT}", "database": "d", "username": "u"}
        )

    with pytest.raises(ValueError, match=message):
        lake.setup_statements("lake")


def test_a_missing_env_var_names_the_attachment_and_the_variable(monkeypatch):
    monkeypatch.delenv("LAKE_MISSING_PASSWORD", raising=False)
    source = _source(
        {
            "catalog": {
                "host": "h",
                "database": "d",
                "username": "u",
                "password": "${env.LAKE_MISSING_PASSWORD}",
            }
        }
    )

    with pytest.raises(click.ClickException) as error:
        with source.connect(read_only=True):
            pass

    assert error.value.message == (
        "Error attaching 'lake' on duckdb source 'lake_source': "
        "Environment variable 'LAKE_MISSING_PASSWORD' is not set"
    )


def test_an_env_var_in_an_attached_database_file_is_resolved(tmp_path, monkeypatch):
    other = tmp_path / "other.duckdb"
    with duckdb.connect(str(other)) as connection:
        connection.execute("CREATE TABLE t AS SELECT 7 AS n")
    monkeypatch.setenv("OTHER_DUCKDB", str(other))
    source = DuckdbSource(
        name="d",
        type="duckdb",
        database=":memory:",
        attach=[
            {
                "schema_name": "other",
                "source": {"name": "o", "type": "duckdb", "database": "${env.OTHER_DUCKDB}"},
            }
        ],
    )

    assert source.read_sql("SELECT n FROM other.t") == [{"n": 7}]


def test_an_env_var_in_the_primary_database_is_resolved(tmp_path, monkeypatch):
    main = tmp_path / "main.duckdb"
    with duckdb.connect(str(main)) as connection:
        connection.execute("CREATE TABLE t AS SELECT 3 AS n")
    monkeypatch.setenv("MAIN_DUCKDB", str(main))
    source = DuckdbSource(name="d", type="duckdb", database="${env.MAIN_DUCKDB}")

    assert source.read_sql("SELECT n FROM t") == [{"n": 3}]


# --- Error surfacing --------------------------------------------------------


def test_redact_removes_secret_values_and_credential_assignments():
    message = (
        "LINE 1: ... PASSWORD 'pg-pass-9f3''k' BOGUS; failed for "
        "host=h user=u password=hunter2 secret=abc at https://user:pw123@host/x pg-pass-9f3'k"
    )

    redacted = redact(message, [PASSWORD, None, ""])

    for leaked in (PASSWORD, "pg-pass-9f3''k", "hunter2", "abc", "pw123"):
        assert leaked not in redacted
    assert "host=h user=u password=*** secret=***" in redacted
    assert "https://user:***@host/x" in redacted


def test_a_failed_file_attach_raises_and_names_the_attachment(tmp_path):
    not_a_database = tmp_path / "broken.duckdb"
    not_a_database.write_text("this is not a duckdb file")
    source = DuckdbSource(
        name="d",
        type="duckdb",
        database=":memory:",
        attach=[
            {
                "schema_name": "broken",
                "source": {"name": "o", "type": "duckdb", "database": str(not_a_database)},
            }
        ],
    )

    with pytest.raises(click.ClickException, match="Error attaching 'broken' on duckdb source 'd'"):
        with source.connect(read_only=True):
            pass
    with pytest.raises(click.ClickException, match="Error attaching 'broken'"):
        source.read_sql("SELECT 1")


def test_a_failed_attach_closes_the_connection(monkeypatch):
    source = _source({"catalog": "ducklake:c.ducklake"})
    closed = []

    class _Connection:
        def execute(self, statement, *args):
            raise RuntimeError("boom")

        def close(self):
            closed.append(True)

    monkeypatch.setattr(DuckdbSource, "get_connection", lambda self, **kwargs: _Connection())

    with pytest.raises(click.ClickException, match="Error attaching 'lake'.*boom"):
        with source.connect(read_only=True):
            pass
    assert closed == [True]


def test_a_failed_ducklake_attach_never_shows_a_secret(monkeypatch):
    source = _source(_postgres_lake())
    executed = []

    class _Result:
        def fetchone(self):
            return (0,)

    class _Connection:
        def execute(self, statement, *args):
            executed.append(statement)
            if statement.startswith("ATTACH"):
                raise RuntimeError(
                    f"Parser Error near: {executed[1]} | {executed[2]} | "
                    f"host=db.example.com user=reader password={PASSWORD}"
                )
            return _Result()

        def close(self):
            pass

    monkeypatch.setattr(DuckdbSource, "get_connection", lambda self, **kwargs: _Connection())

    with pytest.raises(click.ClickException) as error:
        with source.connect(read_only=True):
            pass

    message = error.value.message
    assert message.startswith("Error attaching 'lake' on duckdb source 'lake_source': ")
    for leaked in (PASSWORD, PASSWORD.replace("'", "''"), HMAC_SECRET, HMAC_KEY_ID):
        assert leaked not in message
    assert error.value.__cause__ is None
    assert error.value.__suppress_context__ is True


def test_a_failed_primary_connection_does_not_repeat_a_password_from_its_uri(monkeypatch):
    def _refuse(database, **kwargs):
        raise RuntimeError(f"Unable to connect: {database}")

    monkeypatch.setattr(duckdb, "connect", _refuse)
    source = DuckdbSource(
        name="d", type="duckdb", database="ducklake:postgres:dbname=lake password=hunter2"
    )

    with pytest.raises(click.ClickException) as error:
        source.get_connection(read_only=True)

    assert "hunter2" not in error.value.message
    assert "password=***" in error.value.message


@needs_ducklake
def test_a_missing_ducklake_catalog_fails_at_connect_not_at_query_time(tmp_path):
    source = _source({"catalog": f"ducklake:{tmp_path / 'nope' / 'missing.ducklake'}"})

    with pytest.raises(click.ClickException, match="Error attaching 'lake' on duckdb source"):
        source.read_sql("SELECT 1")


# --- File check -------------------------------------------------------------


def test_is_file_database():
    assert is_file_database("data/a.duckdb")
    assert is_file_database("/abs/a.duckdb")
    assert is_file_database("C:\\data\\a.duckdb")
    assert not is_file_database("ducklake:sqlite:catalog.sqlite")
    assert not is_file_database("DuckLake:postgres:dbname=x")
    assert not is_file_database("md:my_db")
    assert not is_file_database("s3://bucket/a.duckdb")
    assert not is_file_database("https://x.io/a.duckdb")
    assert not is_file_database(":memory:")
    assert not is_file_database("")
    assert not is_file_database(None)


def test_the_file_check_skips_ducklake_uris_and_ducklake_attachments(tmp_path):
    DuckdbSource(
        name="d", type="duckdb", database="ducklake:sqlite:/nowhere/catalog.sqlite"
    ).check_database_files_exist(str(tmp_path))
    DuckdbSource(
        name="d",
        type="duckdb",
        database=":memory:",
        attach=[
            {
                "schema_name": "legacy",
                "source": {"name": "o", "type": "duckdb", "database": "ducklake:/nowhere/c.db"},
            },
            {"schema_name": "lake", "ducklake": _postgres_lake()},
        ],
    ).check_database_files_exist(str(tmp_path))


def test_the_file_check_still_reports_a_missing_file_next_to_a_ducklake(tmp_path):
    source = DuckdbSource(
        name="d",
        type="duckdb",
        database=str(tmp_path / "missing.duckdb"),
        attach=[{"schema_name": "lake", "ducklake": {"catalog": "ducklake:c.ducklake"}}],
    )

    with pytest.raises(FileNotFoundError, match="missing.duckdb"):
        source.check_database_files_exist()


def test_a_ducklake_primary_database_does_not_create_a_directory(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    source = DuckdbSource(name="d", type="duckdb", database="ducklake:sqlite:sub/catalog.sqlite")

    try:
        source.get_connection(read_only=False).close()
    except click.ClickException:
        pass

    assert not (tmp_path / "ducklake:sqlite:sub").exists()


# --- End to end, local DuckLake ---------------------------------------------


@needs_ducklake
def test_a_local_ducklake_is_read_through_a_duckdb_source(tmp_path):
    catalog_uri, _ = _create_lake(tmp_path)
    source = _source({"catalog": catalog_uri})

    rows = source.read_sql(
        "SELECT region, sum(amount) AS total FROM lake.main.orders GROUP BY 1 ORDER BY 1"
    )

    assert rows == [
        {"region": "east", "total": 15},
        {"region": "north", "total": 100},
        {"region": "west", "total": 20},
    ]
    assert "lake" in source.list_databases()
    assert "lake.main.orders" in source.get_schema()["tables"]
    source.check_database_files_exist(str(tmp_path))


@needs_ducklake
def test_a_ducklake_is_read_only_by_default_and_writable_on_request(tmp_path):
    catalog_uri, _ = _create_lake(tmp_path)

    with _source({"catalog": catalog_uri}).connect() as connection:
        with pytest.raises(duckdb.Error, match="read-only"):
            connection.execute("INSERT INTO lake.main.orders VALUES ('south', 1)")

    with _source({"catalog": catalog_uri, "read_only": False}).connect() as connection:
        connection.execute("INSERT INTO lake.main.orders VALUES ('south', 1)")
        assert connection.execute("SELECT count(*) FROM lake.main.orders").fetchone() == (5,)


@needs_ducklake
def test_snapshot_version_reads_the_lake_as_of_that_snapshot(tmp_path):
    catalog_uri, first_snapshot = _create_lake(tmp_path)
    source = _source({"catalog": catalog_uri, "snapshot_version": first_snapshot})

    assert source.read_sql("SELECT count(*) AS n FROM lake.main.orders") == [{"n": 3}]


@needs_ducklake
def test_a_catalog_uri_from_an_env_var_is_read(tmp_path, monkeypatch):
    catalog_uri, _ = _create_lake(tmp_path)
    monkeypatch.setenv("LAKE_CATALOG_URI", catalog_uri)
    source = _source({"catalog": "${env.LAKE_CATALOG_URI}"})

    assert source.read_sql("SELECT count(*) AS n FROM lake.main.orders") == [{"n": 4}]


@needs_ducklake
def test_setup_runs_twice_on_one_connection_without_a_second_attach(tmp_path):
    catalog_uri, _ = _create_lake(tmp_path)
    source = _source({"catalog": catalog_uri})

    with source.connect(read_only=True) as connection:
        source._setup_connection(connection)
        assert connection.execute("SELECT count(*) FROM lake.main.orders").fetchone() == (4,)


@needs_ducklake
def test_a_new_ducklake_is_created_with_a_data_path(tmp_path):
    source = _source(
        {
            "catalog": f"ducklake:{tmp_path / 'new.ducklake'}",
            "data_path": f"{tmp_path / 'new_data'}/",
            "read_only": False,
        }
    )

    with source.connect() as connection:
        connection.execute("CREATE TABLE lake.main.t AS SELECT 1 AS n")
        assert connection.execute("SELECT n FROM lake.main.t").fetchone() == (1,)


@needs_ducklake
@pytest.mark.skipif(
    not _extension_available("httpfs"), reason="DuckDB httpfs extension is not installed"
)
def test_the_gcs_secret_is_created_as_a_temporary_secret(tmp_path):
    catalog_uri, _ = _create_lake(tmp_path)
    source = _source(
        {"catalog": catalog_uri, "gcs": {"key_id": HMAC_KEY_ID, "secret": HMAC_SECRET}}
    )

    with source.connect(read_only=True) as connection:
        secrets = connection.execute(
            "SELECT name, type, persistent, secret_string FROM duckdb_secrets()"
        ).fetchall()
        assert connection.execute("SELECT count(*) FROM lake.main.orders").fetchone() == (4,)

    assert [(name, kind, persistent) for name, kind, persistent, _ in secrets] == [
        ("visivo_lake_storage", "gcs", False)
    ]
    assert HMAC_SECRET not in secrets[0][3]


@needs_ducklake
def test_a_project_with_a_ducklake_source_runs_end_to_end(tmp_path):
    import yaml
    from click.testing import CliRunner
    from visivo.commands.run import run
    import polars

    catalog_uri, _ = _create_lake(tmp_path)
    project_dir = tmp_path / "project"
    project_dir.mkdir()
    project = {
        "name": "lake_project",
        "defaults": {"source_name": "lake_source"},
        "sources": [
            {
                "name": "lake_source",
                "type": "duckdb",
                "database": ":memory:",
                "attach": [{"schema_name": "lake", "ducklake": {"catalog": catalog_uri}}],
            }
        ],
        "models": [
            {
                "name": "orders_by_region",
                "sql": "select region, sum(amount) as total from lake.main.orders group by 1",
            }
        ],
        "dashboards": [
            {
                "name": "dashboard",
                "rows": [
                    {
                        "items": [
                            {
                                "chart": {
                                    "name": "chart",
                                    "insights": [
                                        {
                                            "name": "region_bar",
                                            "props": {
                                                "type": "bar",
                                                "x": "?{${ref(orders_by_region).region}}",
                                                "y": "?{${ref(orders_by_region).total}}",
                                            },
                                        }
                                    ],
                                }
                            }
                        ]
                    }
                ],
            }
        ],
    }
    (project_dir / "project.visivo.yml").write_text(yaml.safe_dump(project))
    output_dir = project_dir / "target"

    result = CliRunner().invoke(
        run, ["-w", str(project_dir), "-o", str(output_dir)], catch_exceptions=False
    )

    assert result.exit_code == 0, result.output
    files = list(output_dir.rglob("*.parquet"))
    assert files, result.output
    totals = set()
    for file in files:
        frame = polars.read_parquet(file)
        for column in frame.columns:
            if frame[column].dtype.is_numeric():
                totals.update(frame[column].to_list())
    assert {15, 20, 100} <= totals


# --- End to end, Postgres catalog (needs Docker) ----------------------------


def _docker_available():
    if not shutil.which("docker"):
        return False
    try:
        return subprocess.run(["docker", "info"], capture_output=True, timeout=20).returncode == 0
    except Exception:
        return False


@pytest.fixture(scope="module")
def postgres_catalog():
    if not _docker_available():
        pytest.skip("Docker is not available")
    if not _extension_available("postgres"):
        pytest.skip("DuckDB postgres extension is not installed")
    name = f"visivo-ducklake-test-{uuid.uuid4().hex[:8]}"
    started = subprocess.run(
        [
            "docker",
            "run",
            "-d",
            "--rm",
            "--name",
            name,
            "-e",
            f"POSTGRES_PASSWORD={PASSWORD}",
            "-e",
            "POSTGRES_DB=ducklake",
            "-p",
            "127.0.0.1::5432",
            "postgres:17-alpine",
        ],
        capture_output=True,
        text=True,
    )
    if started.returncode != 0:
        pytest.skip(f"Could not start a Postgres container: {started.stderr.strip()}")
    try:
        port_output = subprocess.run(
            ["docker", "port", name, "5432"], capture_output=True, text=True, check=True
        ).stdout
        port = int(port_output.splitlines()[0].rsplit(":", 1)[1])
        deadline = time.time() + 60
        while time.time() < deadline:
            ready = subprocess.run(
                [
                    "docker",
                    "exec",
                    name,
                    "psql",
                    "-U",
                    "postgres",
                    "-d",
                    "ducklake",
                    "-c",
                    "select 1",
                ],
                capture_output=True,
            )
            if ready.returncode == 0:
                with socket.socket() as probe:
                    if probe.connect_ex(("127.0.0.1", port)) == 0:
                        break
            time.sleep(0.5)
        else:
            pytest.skip("The Postgres container did not become ready")
        yield {"host": "127.0.0.1", "port": port, "database": "ducklake", "username": "postgres"}
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)


@needs_ducklake
def test_a_postgres_catalog_ducklake_is_written_then_read_read_only(
    postgres_catalog, tmp_path, monkeypatch
):
    monkeypatch.setenv("LAKE_CATALOG_PASSWORD", PASSWORD)
    catalog = {**postgres_catalog, "password": "${env.LAKE_CATALOG_PASSWORD}"}
    writer = _source(
        {"catalog": catalog, "data_path": f"{tmp_path / 'pg_lake'}/", "read_only": False}
    )
    with writer.connect() as connection:
        connection.execute("CREATE TABLE lake.main.orders AS SELECT 'east' AS region, 10 AS amount")

    reader = _source({"catalog": catalog})

    assert reader.read_sql("SELECT region, amount FROM lake.main.orders") == [
        {"region": "east", "amount": 10}
    ]
    with reader.connect() as connection:
        with pytest.raises(duckdb.Error, match="read-only"):
            connection.execute("INSERT INTO lake.main.orders VALUES ('west', 1)")


@needs_ducklake
def test_a_wrong_postgres_password_is_an_attach_error_without_the_password(postgres_catalog):
    wrong = "wrong-password-5d1e"
    source = _source({"catalog": {**postgres_catalog, "password": wrong}})

    with pytest.raises(click.ClickException) as error:
        source.read_sql("SELECT 1")

    assert "Error attaching 'lake' on duckdb source 'lake_source'" in error.value.message
    assert wrong not in error.value.message
