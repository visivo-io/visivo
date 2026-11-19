import base64
import email.utils
import hashlib
import hmac
import json
import socket
import subprocess
import time
import urllib.request
import uuid

import click
import duckdb
import polars
import pytest
from pydantic import TypeAdapter, ValidationError

from tests.models.sources.test_duckdb_ducklake import (
    _create_lake,
    _docker_available,
    _extension_available,
    needs_ducklake,
)
from visivo.logger.logger import Logger
from visivo.models.sources.duckdb_source import DuckdbAttachment, DuckdbSource
from visivo.models.sources.ducklake import (
    DuckLake,
    DuckLakeAzureStorage,
    DuckLakeGcsStorage,
    DuckLakeS3Storage,
    redact,
    validation_error_text,
)
from visivo.models.sources.fields import SourceField

PASSWORD = "pg-pass-9f3'k"
S3_SECRET = "s3-secret-4be1"
S3_TOKEN = "s3-session-token-77aa"
S3_KEY_ID = "AKIAEXAMPLEKEYID"
GCS_SECRET = "hmac-secret-71c2"
GCS_KEY_ID = "GOOG1EXAMPLEKEYID"
AZURE_ACCOUNT_KEY = "YXp1cmUta2V5LTU1ZDI="
AZURE_CONNECTION_STRING = (
    "DefaultEndpointsProtocol=https;AccountName=lakeaccount;"
    f"AccountKey={AZURE_ACCOUNT_KEY};EndpointSuffix=core.windows.net"
)
AZURE_CLIENT_SECRET = "azure-client-secret-3c9"
SECRET_VALUES = (
    PASSWORD,
    S3_SECRET,
    S3_TOKEN,
    GCS_SECRET,
    AZURE_ACCOUNT_KEY,
    AZURE_CONNECTION_STRING,
    AZURE_CLIENT_SECRET,
)

GCS = {"type": "gcs", "key_id": GCS_KEY_ID, "secret": "${env.LAKE_GCS_SECRET}"}
S3 = {"type": "s3", "key_id": S3_KEY_ID, "secret": "${env.LAKE_S3_SECRET}"}
S3_COMPATIBLE = {
    **S3,
    "region": "eu-west-1",
    "endpoint": "minio.internal:9000",
    "session_token": "${env.LAKE_S3_TOKEN}",
    "url_style": "path",
    "use_ssl": False,
}
AZURE_CONNECTION = {"type": "azure", "connection_string": "${env.LAKE_AZURE_CONNECTION}"}
AZURE_PRINCIPAL = {
    "type": "azure",
    "account_name": "lakeaccount",
    "tenant_id": "tenant-1",
    "client_id": "client-1",
    "client_secret": "${env.LAKE_AZURE_CLIENT_SECRET}",
}
AZURE_CHAIN = {"type": "azure", "account_name": "lakeaccount"}

FILE_CATALOG = "ducklake:sqlite:local/catalog.sqlite"


@pytest.fixture(autouse=True)
def lake_credentials(monkeypatch):
    monkeypatch.setenv("LAKE_PASSWORD", PASSWORD)
    monkeypatch.setenv("LAKE_GCS_SECRET", GCS_SECRET)
    monkeypatch.setenv("LAKE_S3_SECRET", S3_SECRET)
    monkeypatch.setenv("LAKE_S3_TOKEN", S3_TOKEN)
    monkeypatch.setenv("LAKE_AZURE_CONNECTION", AZURE_CONNECTION_STRING)
    monkeypatch.setenv("LAKE_AZURE_CLIENT_SECRET", AZURE_CLIENT_SECRET)


def _lake(storage=None, data_path=None, **overrides):
    config = {"catalog": FILE_CATALOG, **overrides}
    if storage is not None:
        config["storage"] = storage
    if data_path is not None:
        config["data_path"] = data_path
    return config


def _postgres_catalog():
    return {
        "host": "db.example.com",
        "database": "ducklake",
        "username": "reader",
        "password": "${env.LAKE_PASSWORD}",
    }


def _source(database, **kwargs):
    return DuckdbSource(name="lake_source", type="duckdb", database=database, **kwargs)


# --- Storage: model validation ----------------------------------------------


@pytest.mark.parametrize(
    "storage, data_path, model",
    [
        (GCS, "gs://bucket/lake/", DuckLakeGcsStorage),
        (GCS, "gcs://bucket/lake/", DuckLakeGcsStorage),
        (S3, "s3://bucket/lake/", DuckLakeS3Storage),
        (S3_COMPATIBLE, "S3://bucket/lake/", DuckLakeS3Storage),
        (AZURE_CONNECTION, "az://container/lake/", DuckLakeAzureStorage),
        (
            AZURE_PRINCIPAL,
            "abfss://files@lakeaccount.dfs.core.windows.net/lake/",
            DuckLakeAzureStorage,
        ),
        (AZURE_CHAIN, "az://container/lake/", DuckLakeAzureStorage),
        (S3, None, DuckLakeS3Storage),
        (S3, "${env.LAKE_DATA_PATH}", DuckLakeS3Storage),
    ],
)
def test_a_storage_block_of_each_type_is_valid(storage, data_path, model):
    lake = DuckLake(**_lake(storage, data_path))

    assert isinstance(lake.storage, model)
    assert lake.read_only is True


@pytest.mark.parametrize("data_path", [None, "local/lake/", "https://example.com/lake/"])
def test_a_ducklake_needs_no_storage_block(data_path):
    lake = DuckLake(**_lake(data_path=data_path))

    assert lake.storage is None
    assert not any("SECRET" in statement for statement in lake.setup_statements("lake"))


@pytest.mark.parametrize(
    "storage, data_path, message",
    [
        (
            GCS,
            "s3://bucket/lake/",
            "storage type 'gcs' needs a data_path that starts with 'gs://' or 'gcs://'",
        ),
        (S3, "gs://bucket/lake/", "storage type 's3' needs a data_path that starts with 's3://'"),
        (S3, "local/lake/", "storage type 's3' needs a data_path that starts with 's3://'"),
        (
            AZURE_CONNECTION,
            "s3://bucket/lake/",
            "storage type 'azure' needs a data_path that starts with 'az://' or 'abfss://'",
        ),
        (
            AZURE_CHAIN,
            "https://lakeaccount.blob.core.windows.net/c/",
            "storage type 'azure' needs a data_path",
        ),
    ],
)
def test_the_data_path_scheme_must_match_the_storage_type(storage, data_path, message):
    with pytest.raises(ValidationError) as error:
        DuckLake(**_lake(storage, data_path))

    assert message in str(error.value)


@pytest.mark.parametrize(
    "storage, message",
    [
        ({"key_id": "k", "secret": "${env.X}"}, "Unable to extract tag using discriminator 'type'"),
        ({**S3, "type": "r2"}, "does not match any of the expected tags: 'gcs', 's3', 'azure'"),
        ({"type": "gcs", "key_id": GCS_KEY_ID}, "Field required"),
        ({"type": "s3", "secret": "${env.LAKE_S3_SECRET}"}, "Field required"),
        ({**GCS, "region": "us-east-1"}, "Extra inputs are not permitted"),
        ({**S3, "url_style": "virtual"}, "Input should be 'vhost' or 'path'"),
        ({**S3, "use_ssl": "sometimes"}, "Input should be a valid boolean"),
        ({**S3, "connection_string": "${env.X}"}, "Extra inputs are not permitted"),
        ({"type": "azure"}, "azure storage needs a connection_string or an account_name"),
        (
            {**AZURE_CONNECTION, "account_name": "lakeaccount"},
            "azure storage takes a connection_string or an account_name, not both",
        ),
        (
            {**AZURE_CONNECTION, "client_secret": "${env.LAKE_AZURE_CLIENT_SECRET}"},
            "azure storage takes a connection_string or an account_name, not both",
        ),
        (
            {**AZURE_CHAIN, "tenant_id": "tenant-1"},
            "An azure service principal needs tenant_id, client_id and client_secret",
        ),
        (
            {**AZURE_PRINCIPAL, "client_id": None},
            "An azure service principal needs tenant_id, client_id and client_secret",
        ),
    ],
)
def test_a_bad_storage_block_is_refused(storage, message):
    with pytest.raises(ValidationError) as error:
        DuckLake(**_lake(storage))

    assert message in str(error.value)


def test_the_gcs_field_is_gone():
    with pytest.raises(ValidationError, match="gcs\n  Extra inputs are not permitted"):
        DuckLake(**_lake(gcs={"key_id": GCS_KEY_ID, "secret": "${env.LAKE_GCS_SECRET}"}))


@pytest.mark.parametrize(
    "storage, field",
    [
        (GCS, "secret"),
        (S3, "secret"),
        (S3, "session_token"),
        (AZURE_CONNECTION, "connection_string"),
        (AZURE_PRINCIPAL, "client_secret"),
    ],
)
@pytest.mark.parametrize("value", ["plain-text-7c1", "**********"])
def test_a_plaintext_storage_secret_is_refused_by_the_source_and_not_repeated(
    storage, field, value
):
    config = {
        "name": "lake_source",
        "type": "duckdb",
        "database": _lake({**storage, field: value}),
    }

    with pytest.raises(ValidationError) as error:
        TypeAdapter(SourceField).validate_python(config)

    text = validation_error_text(error.value)
    assert "must be an environment variable reference" in text
    assert "plain-text-7c1" not in text


# --- Storage: SQL generation ------------------------------------------------


def _storage_statement(storage, data_path):
    statements = DuckLake(**_lake(storage, data_path)).setup_statements("lake")
    assert len(statements) == 2
    assert statements[1].startswith("ATTACH 'ducklake:sqlite:local/catalog.sqlite' AS \"lake\" (")
    return statements[0]


def test_gcs_storage_emits_a_scoped_gcs_secret():
    assert _storage_statement(GCS, "gs://bucket/lake/") == (
        'CREATE OR REPLACE TEMPORARY SECRET "visivo_lake_storage" (TYPE gcs, '
        f"KEY_ID '{GCS_KEY_ID}', SECRET '{GCS_SECRET}', SCOPE 'gs://bucket/lake/')"
    )


def test_s3_storage_emits_a_scoped_s3_secret():
    assert _storage_statement(S3, "s3://bucket/lake/") == (
        'CREATE OR REPLACE TEMPORARY SECRET "visivo_lake_storage" (TYPE s3, '
        f"KEY_ID '{S3_KEY_ID}', SECRET '{S3_SECRET}', SCOPE 's3://bucket/lake/')"
    )


def test_s3_storage_for_a_compatible_store_emits_each_option():
    assert _storage_statement(S3_COMPATIBLE, "s3://bucket/lake/") == (
        'CREATE OR REPLACE TEMPORARY SECRET "visivo_lake_storage" (TYPE s3, '
        f"KEY_ID '{S3_KEY_ID}', SECRET '{S3_SECRET}', REGION 'eu-west-1', "
        f"ENDPOINT 'minio.internal:9000', SESSION_TOKEN '{S3_TOKEN}', URL_STYLE 'path', "
        "USE_SSL false, SCOPE 's3://bucket/lake/')"
    )
    assert "USE_SSL true" in _storage_statement({**S3, "use_ssl": True}, "s3://bucket/lake/")


def test_azure_storage_with_a_connection_string():
    assert _storage_statement(AZURE_CONNECTION, "az://container/lake/") == (
        'CREATE OR REPLACE TEMPORARY SECRET "visivo_lake_storage" (TYPE azure, '
        f"CONNECTION_STRING '{AZURE_CONNECTION_STRING}', SCOPE 'az://container/lake/')"
    )


def test_azure_storage_with_a_service_principal():
    data_path = "abfss://files@lakeaccount.dfs.core.windows.net/lake/"

    assert _storage_statement(AZURE_PRINCIPAL, data_path) == (
        'CREATE OR REPLACE TEMPORARY SECRET "visivo_lake_storage" (TYPE azure, '
        "PROVIDER service_principal, TENANT_ID 'tenant-1', CLIENT_ID 'client-1', "
        f"CLIENT_SECRET '{AZURE_CLIENT_SECRET}', ACCOUNT_NAME 'lakeaccount', "
        f"SCOPE '{data_path}')"
    )


def test_azure_storage_with_an_account_name_uses_the_credential_chain():
    assert _storage_statement(AZURE_CHAIN, "az://container/lake/") == (
        'CREATE OR REPLACE TEMPORARY SECRET "visivo_lake_storage" (TYPE azure, '
        "PROVIDER credential_chain, ACCOUNT_NAME 'lakeaccount', SCOPE 'az://container/lake/')"
    )


@pytest.mark.parametrize("storage", [GCS, S3, AZURE_CONNECTION, AZURE_PRINCIPAL, AZURE_CHAIN])
def test_storage_without_a_data_path_has_no_scope(storage):
    statement = DuckLake(**_lake(storage)).setup_statements("lake")[0]

    assert "SCOPE" not in statement


def test_a_quote_in_a_storage_value_stays_inside_the_literal(monkeypatch):
    monkeypatch.setenv("LAKE_S3_SECRET", "x', SCOPE 's3://other/")
    storage = {**S3, "key_id": "k'); DROP TABLE t; --", "endpoint": "host'9000"}

    statement = _storage_statement(storage, "s3://bucket/la'ke/")

    assert "KEY_ID 'k''); DROP TABLE t; --'" in statement
    assert "SECRET 'x'', SCOPE ''s3://other/'" in statement
    assert "ENDPOINT 'host''9000'" in statement
    assert statement.endswith("SCOPE 's3://bucket/la''ke/')")


@pytest.mark.parametrize("field", ["key_id", "region", "endpoint"])
def test_a_control_character_in_a_storage_value_is_refused(field):
    lake = DuckLake(**_lake({**S3, field: "a\nb"}, "s3://bucket/lake/"))

    with pytest.raises(ValueError, match=f"s3 {field} must not contain control characters"):
        lake.setup_statements("lake")


def test_the_data_path_scheme_is_checked_again_after_env_resolution(monkeypatch):
    monkeypatch.setenv("LAKE_DATA_PATH", "gs://bucket/lake/")
    lake = DuckLake(**_lake(S3, "${env.LAKE_DATA_PATH}"))

    with pytest.raises(ValueError, match="storage type 's3' needs a data_path"):
        lake.setup_statements("lake")


@pytest.mark.parametrize(
    "storage, data_path, kind, provider",
    [
        (GCS, "gs://bucket/lake/", "gcs", "config"),
        (GCS, "gcs://bucket/lake/", "gcs", "config"),
        (S3_COMPATIBLE, "s3://bucket/lake/", "s3", "config"),
        (AZURE_CONNECTION, "az://container/lake/", "azure", "config"),
        (
            AZURE_PRINCIPAL,
            "abfss://files@lakeaccount.dfs.core.windows.net/lake/",
            "azure",
            "service_principal",
        ),
        (AZURE_CHAIN, "az://container/lake/", "azure", "credential_chain"),
    ],
)
def test_duckdb_accepts_the_secret_statement_and_scopes_it(storage, data_path, kind, provider):
    extension = "azure" if kind == "azure" else "httpfs"
    if not _extension_available(extension):
        pytest.skip(f"DuckDB {extension} extension is not installed")
    statement = DuckLake(**_lake(storage, data_path)).setup_statements("lake")[0]

    with duckdb.connect(":memory:") as connection:
        connection.execute(statement)
        secrets = connection.execute(
            "SELECT name, type, provider, persistent, scope, secret_string FROM duckdb_secrets()"
        ).fetchall()
        matched = connection.execute(
            f"SELECT name FROM which_secret('{data_path}main/orders/file.parquet', '{kind}')"
        ).fetchall()

    assert [row[:5] for row in secrets] == [
        ("visivo_lake_storage", kind, provider, False, [data_path])
    ]
    assert matched == [("visivo_lake_storage",)]
    for secret in SECRET_VALUES:
        assert secret not in secrets[0][5]


# --- Storage: secrets stay out of text --------------------------------------


@pytest.mark.parametrize("storage", [GCS, S3_COMPATIBLE, AZURE_CONNECTION, AZURE_PRINCIPAL])
def test_storage_secrets_are_not_in_the_repr_the_dump_or_the_description(storage):
    source = _source(
        {"catalog": _postgres_catalog(), "storage": storage},
        attach=[{"schema_name": "other", "ducklake": _lake()}],
    )

    texts = (
        repr(source),
        str(source),
        source.model_dump_json(),
        str(source.model_dump()),
        source.description(),
    )
    for text in texts:
        for secret in SECRET_VALUES:
            assert secret not in text


def test_secret_values_lists_each_resolved_storage_secret():
    assert set(DuckLake(**_lake(S3_COMPATIBLE)).secret_values()) == {
        S3_SECRET,
        S3_TOKEN,
        S3_KEY_ID,
    }
    assert set(DuckLake(**_lake(AZURE_CONNECTION)).secret_values()) == {
        AZURE_CONNECTION_STRING,
        AZURE_ACCOUNT_KEY,
    }
    assert DuckLake(**_lake(AZURE_PRINCIPAL)).secret_values() == [AZURE_CLIENT_SECRET]
    assert DuckLake(**_lake(AZURE_CHAIN)).secret_values() == []


def test_redact_removes_an_account_key_and_a_signature():
    message = redact(
        "bad connection string AccountName=lake;AccountKey=abc123==;x "
        "SharedAccessSignature=sv=2020&sig=zzz9 design=flat"
    )

    assert "abc123" not in message and "zzz9" not in message
    assert "AccountName=lake" in message and "design=flat" in message


@pytest.mark.parametrize("storage", [S3_COMPATIBLE, AZURE_CONNECTION, AZURE_PRINCIPAL, GCS])
def test_a_failed_connection_never_shows_a_storage_secret(monkeypatch, storage):
    source = _source({"catalog": _postgres_catalog(), "storage": storage})
    executed = []
    logged = []

    class _Connection:
        def execute(self, statement, *args):
            executed.append(statement)
            if statement.startswith("ATTACH"):
                raise RuntimeError(f"Parser Error near: {' | '.join(executed)}")

        def close(self):
            executed.append("closed")

    monkeypatch.setattr(duckdb, "connect", lambda *args, **kwargs: _Connection())
    monkeypatch.setattr(Logger.instance(), "debug", logged.append)

    with pytest.raises(click.ClickException) as error:
        source.get_connection(read_only=True)
    with pytest.raises(click.ClickException) as query_error:
        source.read_sql("SELECT 1")

    assert executed[-1] == "closed"
    assert error.value.message.startswith(
        "Error connecting to source 'lake_source'. Ensure the DuckLake catalog exists"
    )
    assert error.value.__cause__ is None and error.value.__suppress_context__ is True
    assert logged
    for secret in SECRET_VALUES + (PASSWORD.replace("'", "''"),):
        assert secret not in error.value.message
        assert secret not in query_error.value.message
        assert secret not in " ".join(logged)


# --- database: a DuckLake object --------------------------------------------


def test_a_string_database_is_parsed_as_before():
    for database in ("local/file.duckdb", ":memory:", "https://example.com/ev_sales.duckdb"):
        source = _source(database)
        assert source.database == database and type(source.database) is str
        assert source.is_ducklake_database() is False
        assert source.get_database() == database
        assert source.model_dump(mode="json", exclude_none=True)["database"] == database
    assert _source("${env.LAKE_DB}").model_dump(mode="json")["database"] == "${env.LAKE_DB}"

    with pytest.raises(ValidationError) as error:
        _source(5)
    assert "database.String\n  Input should be a valid string" in str(error.value)
    with pytest.raises(ValidationError, match="database\n  Field required"):
        DuckdbSource(name="lake_source", type="duckdb")


def test_a_ducklake_database_is_parsed_from_an_object():
    source = TypeAdapter(SourceField).validate_python(
        {
            "name": "lake_source",
            "type": "duckdb",
            "database": {
                "catalog": _postgres_catalog(),
                "data_path": "s3://bucket/lake/",
                "storage": S3,
            },
        }
    )

    assert isinstance(source, DuckdbSource)
    assert isinstance(source.database, DuckLake)
    assert source.is_ducklake_database() is True
    assert source.database.read_only is True
    assert source.get_database() == "ducklake:postgres:"
    dumped = source.model_dump(mode="json", exclude_none=True)["database"]
    assert dumped == {
        "catalog": {**_postgres_catalog(), "type": "postgres", "port": 5432},
        "data_path": "s3://bucket/lake/",
        "read_only": True,
        "storage": S3,
    }
    assert (
        TypeAdapter(SourceField).validate_python(source.model_dump(mode="json", exclude_none=True))
        == source
    )


@pytest.mark.parametrize(
    "database, message",
    [
        ({}, "database.DuckLake.catalog\n  Field required"),
        ({"catalog": "catalog.sqlite"}, "catalog must be a 'ducklake:' URI"),
        (
            {"catalog": "ducklake:postgres:dbname=x password=y"},
            "A Postgres catalog must use the catalog fields",
        ),
        ({"catalog": FILE_CATALOG, "schema_name": "lake"}, "Extra inputs are not permitted"),
        (
            {"catalog": FILE_CATALOG, "read_only": False, "snapshot_version": 3},
            "snapshot_version needs read_only: true",
        ),
        (
            {"catalog": FILE_CATALOG, "data_path": "gs://b/l/", "storage": S3},
            "storage type 's3' needs a data_path",
        ),
        (
            {
                "catalog": {
                    **{"host": "h", "database": "d", "username": "u"},
                    "password": "plain-text-7c1",
                }
            },
            "catalog password must be an environment variable reference",
        ),
    ],
)
def test_a_bad_ducklake_database_is_refused(database, message):
    with pytest.raises(ValidationError) as error:
        _source(database)

    assert message in str(error.value)
    assert "plain-text-7c1" not in validation_error_text(error.value)
    assert "database.String" not in str(error.value)


def test_a_ducklake_database_emits_secrets_an_attach_and_use(monkeypatch):
    source = _source(
        {"catalog": _postgres_catalog(), "data_path": "s3://bucket/lake/", "storage": S3}
    )
    executed = []

    class _Connection:
        def execute(self, statement, *args):
            executed.append(statement)

    monkeypatch.setattr(
        duckdb, "connect", lambda *args, **kwargs: executed.append(args) or _Connection()
    )

    source.get_connection(read_only=True)

    assert executed == [
        (":memory:",),
        'CREATE OR REPLACE TEMPORARY SECRET "visivo_lake_catalog" (TYPE postgres, '
        "HOST 'db.example.com', PORT 5432, DATABASE 'ducklake', USER 'reader', "
        "PASSWORD 'pg-pass-9f3''k')",
        'CREATE OR REPLACE TEMPORARY SECRET "visivo_lake_storage" (TYPE s3, '
        f"KEY_ID '{S3_KEY_ID}', SECRET '{S3_SECRET}', SCOPE 's3://bucket/lake/')",
        "ATTACH 'ducklake:postgres:' AS \"lake\" (META_SECRET 'visivo_lake_catalog', "
        "DATA_PATH 's3://bucket/lake/', READ_ONLY)",
        'USE "lake"',
    ]


def test_more_than_one_ducklake_with_storage_each_need_a_data_path():
    def source(database_path, attached_path):
        return _source(
            _lake(S3, database_path),
            attach=[{"schema_name": "other", "ducklake": _lake(GCS, attached_path)}],
        )

    with pytest.raises(ValidationError, match="database needs a data_path"):
        source(None, "gs://bucket/lake/")
    with pytest.raises(ValidationError, match="Attachment 'other' needs a data_path"):
        source("s3://bucket/lake/", None)

    assert source("s3://bucket/lake/", "gs://bucket/lake/").attach[0].ducklake.storage.type == "gcs"
    assert _source(_lake(S3)).database.data_path is None
    assert (
        _source(_lake(S3), attach=[{"schema_name": "other", "ducklake": _lake()}]).attach[0]
        is not None
    )


def test_the_source_of_an_attachment_is_not_a_ducklake():
    with pytest.raises(ValidationError, match="Put a DuckLake in the 'ducklake' block"):
        DuckdbAttachment(
            schema_name="other",
            source={"name": "o", "type": "duckdb", "database": {"catalog": FILE_CATALOG}},
        )


def test_the_project_schema_describes_the_database_object_and_each_storage_type():
    from visivo.parsers.schema_generator import generate_schema

    definitions = json.loads(generate_schema())["$defs"]

    database = definitions["DuckdbSource"]["properties"]["database"]
    assert {"$ref": "#/$defs/DuckLake"} in database["oneOf"]
    assert {"type": "string"} in database["oneOf"]
    assert "database" in definitions["DuckdbSource"]["required"]
    storage = json.dumps(definitions["DuckLake"]["properties"]["storage"])
    for name in ("DuckLakeGcsStorage", "DuckLakeS3Storage", "DuckLakeAzureStorage"):
        assert f"#/$defs/{name}" in storage
        assert "type" in definitions[name]["required"]
    assert "gcs" not in definitions["DuckLake"]["properties"]
    assert definitions["DuckLakeS3Storage"]["properties"]["url_style"]["anyOf"][0]["enum"] == [
        "vhost",
        "path",
    ]


# --- database: end to end against a local DuckLake --------------------------


def _other_database(tmp_path):
    path = tmp_path / "other.duckdb"
    with duckdb.connect(str(path)) as connection:
        connection.execute(
            "CREATE TABLE regions AS SELECT * FROM (VALUES ('east', 'E'), ('west', 'W')) "
            "AS t(region, code)"
        )
    return str(path)


@needs_ducklake
def test_a_ducklake_database_reads_unqualified_and_main_qualified_tables(tmp_path):
    catalog_uri, _ = _create_lake(tmp_path)
    source = _source({"catalog": catalog_uri})

    expected = [
        {"region": "east", "total": 15},
        {"region": "north", "total": 100},
        {"region": "west", "total": 20},
    ]
    for table in ("orders", "main.orders", "lake.main.orders"):
        rows = source.read_sql(
            f"SELECT region, sum(amount) AS total FROM {table} GROUP BY 1 ORDER BY 1"
        )
        assert rows == expected
    source.check_database_files_exist(str(tmp_path))
    assert source.get_database() == catalog_uri
    assert source.description() == (
        f"duckdb source 'lake_source' (database: DuckLake {catalog_uri})"
    )


@needs_ducklake
def test_a_ducklake_database_is_introspected(tmp_path):
    catalog_uri, _ = _create_lake(tmp_path)
    source = _source({"catalog": catalog_uri})

    schema = source.get_schema()

    assert list(schema["tables"]) == ["lake.main.orders"]
    assert schema["metadata"]["database"] == "lake"
    assert set(schema["tables"]["lake.main.orders"]["columns"]) == {"region", "amount"}
    assert source.list_databases() == ["main"]
    assert source.get_schemas("main") == ["main"]
    assert source.get_tables("main") == [{"name": "orders", "type": "table"}]
    assert [column["name"] for column in source.get_columns("main", "orders")] == [
        "region",
        "amount",
    ]
    assert source.get_table_preview("main", "orders", limit=2)["row_count"] == 2
    assert source.table_exists("orders") is True
    assert source.table_exists("missing") is False
    assert source.introspect()["databases"][0]["name"] == "lake"


@needs_ducklake
def test_an_attachment_joins_a_database_file_with_a_ducklake_database(tmp_path):
    catalog_uri, _ = _create_lake(tmp_path)
    source = _source(
        {"catalog": catalog_uri},
        attach=[
            {
                "schema_name": "other",
                "source": {"name": "o", "type": "duckdb", "database": _other_database(tmp_path)},
            }
        ],
    )

    rows = source.read_sql(
        "SELECT r.code, sum(o.amount) AS total FROM orders o "
        "JOIN other.regions r USING (region) GROUP BY 1 ORDER BY 1"
    )

    assert rows == [{"code": "E", "total": 15}, {"code": "W", "total": 20}]
    assert source.list_databases() == ["main", "other"]
    assert set(source.get_schema()["tables"]) == {"lake.main.orders", "other.main.regions"}


@needs_ducklake
def test_a_second_ducklake_is_attached_next_to_a_ducklake_database(tmp_path):
    first = tmp_path / "first"
    second = tmp_path / "second"
    first.mkdir()
    second.mkdir()
    first_uri, _ = _create_lake(first)
    second_uri, _ = _create_lake(second)
    source = _source(
        {"catalog": first_uri},
        attach=[{"schema_name": "archive", "ducklake": {"catalog": second_uri}}],
    )

    rows = source.read_sql(
        "SELECT (SELECT count(*) FROM orders) AS a, "
        "(SELECT count(*) FROM archive.main.orders) AS b"
    )

    assert rows == [{"a": 4, "b": 4}]


@needs_ducklake
def test_an_attachment_named_like_the_ducklake_database_fails_at_connect(tmp_path):
    catalog_uri, _ = _create_lake(tmp_path)
    source = _source(
        {"catalog": catalog_uri},
        attach=[
            {
                "schema_name": "lake",
                "source": {"name": "o", "type": "duckdb", "database": _other_database(tmp_path)},
            }
        ],
    )

    with pytest.raises(click.ClickException) as error:
        source.read_sql("SELECT 1")

    assert "Error attaching 'lake'" in error.value.message
    assert "the name is already used by the primary database" in error.value.message


@needs_ducklake
def test_db_schema_sets_the_default_schema_of_a_ducklake_database(tmp_path):
    catalog_uri, _ = _create_lake(tmp_path)
    with duckdb.connect(":memory:") as connection:
        connection.execute(f"ATTACH '{catalog_uri}' AS lake")
        connection.execute("CREATE SCHEMA lake.sales")
        connection.execute("CREATE TABLE lake.sales.items AS SELECT 7 AS id")
    source = _source({"catalog": catalog_uri}, db_schema="sales")

    assert source.read_sql("SELECT id FROM items") == [{"id": 7}]
    assert source.read_sql("SELECT count(*) AS n FROM main.orders") == [{"n": 4}]


@needs_ducklake
def test_a_read_only_ducklake_database_refuses_a_write_with_a_clear_error(tmp_path):
    from visivo.models.sources.seed import Seed

    catalog_uri, _ = _create_lake(tmp_path)
    source = _source({"catalog": catalog_uri})
    frame = polars.DataFrame({"a": [1]})
    csv = tmp_path / "seed.csv"
    csv.write_text("a\n1\n")
    message = (
        "Cannot write to duckdb source 'lake_source': its DuckLake is read-only. "
        "Set read_only: false on database to write to it."
    )

    with pytest.raises(click.ClickException) as dataframe_error:
        source.write_dataframe("seeded", frame)
    with pytest.raises(click.ClickException) as file_error:
        source.write_file(Seed(table_name="seeded", file=str(csv)), str(csv))

    assert dataframe_error.value.message == message
    assert file_error.value.message == message
    assert source.table_exists("seeded") is False
    with source.connect() as connection:
        with pytest.raises(duckdb.Error, match="read-only"):
            connection.execute("INSERT INTO orders VALUES ('west', 1)")


@needs_ducklake
def test_a_writable_ducklake_database_takes_seed_writes(tmp_path):
    from visivo.models.sources.seed import Seed

    catalog_uri, _ = _create_lake(tmp_path)
    source = _source({"catalog": catalog_uri, "read_only": False})
    csv = tmp_path / "seed.csv"
    csv.write_text("a\n5\n6\n")

    source.write_dataframe("seeded", polars.DataFrame({"a": [1]}))
    source.write_dataframe("seeded", polars.DataFrame({"a": [2]}))
    source.write_dataframe("seeded", polars.DataFrame({"a": [3]}), replace=False)
    source.write_file(Seed(table_name="from_file", file=str(csv)), str(csv))

    assert source.read_sql("SELECT a FROM seeded ORDER BY 1") == [{"a": 2}, {"a": 3}]
    assert source.read_sql("SELECT sum(a) AS total FROM lake.main.from_file") == [{"total": 11}]


@needs_ducklake
def test_snapshot_version_reads_a_ducklake_database_as_of_that_snapshot(tmp_path):
    catalog_uri, first = _create_lake(tmp_path)

    assert _source({"catalog": catalog_uri, "snapshot_version": first}).read_sql(
        "SELECT count(*) AS n FROM orders"
    ) == [{"n": 3}]


@needs_ducklake
def test_an_env_var_catalog_of_a_ducklake_database_is_resolved_at_connect(tmp_path, monkeypatch):
    catalog_uri, _ = _create_lake(tmp_path)
    source = _source({"catalog": "${env.LAKE_CATALOG_URI}"})
    monkeypatch.setenv("LAKE_CATALOG_URI", catalog_uri)

    assert source.read_sql("SELECT count(*) AS n FROM orders") == [{"n": 4}]
    assert "${env.LAKE_CATALOG_URI}" in source.description()

    monkeypatch.setenv("LAKE_CATALOG_URI", "ducklake:postgresql://u:hunter2pw@host/db")
    with pytest.raises(click.ClickException) as error:
        source.read_sql("SELECT 1")
    assert "must name a catalog in a DuckDB or SQLite file" in error.value.message
    assert "hunter2pw" not in error.value.message


@needs_ducklake
def test_a_missing_catalog_of_a_ducklake_database_fails_at_connect(tmp_path):
    source = _source({"catalog": f"ducklake:{tmp_path / 'missing' / 'catalog.ducklake'}"})

    with pytest.raises(click.ClickException) as error:
        source.read_sql("SELECT 1")

    assert (
        "Error connecting to source 'lake_source'. Ensure the DuckLake catalog exists"
        in error.value.message
    )


@needs_ducklake
def test_the_connection_test_passes_for_a_ducklake_database(tmp_path):
    from visivo.server.source_metadata import validate_source_from_config

    catalog_uri, _ = _create_lake(tmp_path)

    connected = validate_source_from_config(
        {"name": "lake_source", "type": "duckdb", "database": {"catalog": catalog_uri}},
        project_dir=str(tmp_path),
    )
    refused = validate_source_from_config(
        {"name": "lake_source", "type": "duckdb", "database": {"catalog": "nope"}},
        project_dir=str(tmp_path),
    )

    assert connected == {"source": "lake_source", "status": "connected"}
    assert refused["status"] == "connection_failed"
    assert "catalog must be a 'ducklake:' URI" in refused["error"]


@needs_ducklake
@pytest.mark.parametrize("form", ["database", "attach"])
def test_a_project_with_a_ducklake_runs_end_to_end(tmp_path, form):
    import yaml
    from click.testing import CliRunner
    from visivo.commands.run import run

    catalog_uri, _ = _create_lake(tmp_path)
    project_dir = tmp_path / "project"
    project_dir.mkdir()
    if form == "database":
        source = {"name": "lake_source", "type": "duckdb", "database": {"catalog": catalog_uri}}
        table = "orders"
    else:
        source = {
            "name": "lake_source",
            "type": "duckdb",
            "database": ":memory:",
            "attach": [{"schema_name": "lake", "ducklake": {"catalog": catalog_uri}}],
        }
        table = "lake.main.orders"
    project = {
        "name": "lake_project",
        "defaults": {"source_name": "lake_source"},
        "sources": [source],
        "models": [
            {
                "name": "orders_by_region",
                "sql": f"select region, sum(amount) as total from {table} group by 1",
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


# --- End to end, object stores in local containers (needs Docker) -----------

S3_ROOT_KEY = "lakeaccess"
S3_ROOT_SECRET = "lake-secret-88f2"
AZURITE_ACCOUNT = "devstoreaccount1"
# The published development key of the Azurite emulator. It is not a secret.
AZURITE_KEY = (
    "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/" "KBHBeksoGMGw=="
)


def _start_container(arguments, container_port):
    name = f"visivo-ducklake-test-{uuid.uuid4().hex[:8]}"
    started = subprocess.run(
        ["docker", "run", "-d", "--rm", "--name", name, "-p", f"127.0.0.1::{container_port}"]
        + arguments,
        capture_output=True,
        text=True,
    )
    if started.returncode != 0:
        pytest.skip(f"Could not start a container: {started.stderr.strip()[-200:]}")
    try:
        output = subprocess.run(
            ["docker", "port", name, str(container_port)],
            capture_output=True,
            text=True,
            check=True,
        ).stdout
        port = int(output.splitlines()[0].rsplit(":", 1)[1])
        deadline = time.time() + 60
        while time.time() < deadline:
            with socket.socket() as probe:
                if probe.connect_ex(("127.0.0.1", port)) == 0:
                    return name, port
            time.sleep(0.5)
    except Exception:
        pass
    subprocess.run(["docker", "rm", "-f", name], capture_output=True)
    pytest.skip("The container did not become ready")


@pytest.fixture(scope="module")
def s3_store():
    """An S3-compatible store (Versity S3 Gateway) with one bucket, `lake-bucket`."""
    if not _docker_available():
        pytest.skip("Docker is not available")
    if not _extension_available("httpfs"):
        pytest.skip("DuckDB httpfs extension is not installed")
    name, port = _start_container(
        [
            "-e",
            f"ROOT_ACCESS_KEY={S3_ROOT_KEY}",
            "-e",
            f"ROOT_SECRET_KEY={S3_ROOT_SECRET}",
            "versity/versitygw:v1.11.0",
            "posix",
            "/tmp",
        ],
        7070,
    )
    try:
        made = subprocess.run(
            ["docker", "exec", name, "mkdir", "/tmp/lake-bucket"], capture_output=True
        )
        if made.returncode != 0:
            pytest.skip("Could not create a bucket in the S3 container")
        yield {
            "type": "s3",
            "key_id": S3_ROOT_KEY,
            "secret": "${env.LAKE_E2E_S3_SECRET}",
            "region": "us-east-1",
            "endpoint": f"127.0.0.1:{port}",
            "url_style": "path",
            "use_ssl": False,
        }
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)


def _create_azurite_container(port, container):
    date = email.utils.formatdate(usegmt=True)
    version = "2021-08-06"
    to_sign = (
        "PUT\n\n\n\n\n\n\n\n\n\n\n\n"
        f"x-ms-date:{date}\nx-ms-version:{version}\n"
        f"/{AZURITE_ACCOUNT}/{AZURITE_ACCOUNT}/{container}\nrestype:container"
    )
    signature = base64.b64encode(
        hmac.new(base64.b64decode(AZURITE_KEY), to_sign.encode(), hashlib.sha256).digest()
    ).decode()
    request = urllib.request.Request(
        f"http://127.0.0.1:{port}/{AZURITE_ACCOUNT}/{container}?restype=container",
        method="PUT",
        headers={
            "x-ms-date": date,
            "x-ms-version": version,
            "Authorization": f"SharedKey {AZURITE_ACCOUNT}:{signature}",
            "Content-Length": "0",
        },
    )
    urllib.request.urlopen(request, timeout=20).close()


@pytest.fixture(scope="module")
def azure_store():
    """The Azurite emulator with one container, `lake`. Yields its connection string."""
    if not _docker_available():
        pytest.skip("Docker is not available")
    if not _extension_available("azure"):
        pytest.skip("DuckDB azure extension is not installed")
    name, port = _start_container(
        [
            "mcr.microsoft.com/azure-storage/azurite:latest",
            "azurite-blob",
            "--blobHost",
            "0.0.0.0",
            "--skipApiVersionCheck",
        ],
        10000,
    )
    try:
        deadline = time.time() + 30
        while True:
            try:
                _create_azurite_container(port, "lake")
                break
            except Exception:
                if time.time() > deadline:
                    pytest.skip("Could not create a container in Azurite")
                time.sleep(0.5)
        yield (
            f"DefaultEndpointsProtocol=http;AccountName={AZURITE_ACCOUNT};"
            f"AccountKey={AZURITE_KEY};BlobEndpoint=http://127.0.0.1:{port}/{AZURITE_ACCOUNT};"
        )
    finally:
        subprocess.run(["docker", "rm", "-f", name], capture_output=True)


def _write_then_read(lake, data_file_prefix):
    """Write more rows than DuckLake keeps inline in the catalog, so a data file is written."""
    writer = _source({**lake, "read_only": False})
    writer.write_dataframe(
        "orders",
        polars.DataFrame({"region": ["east", "west"] * 500, "amount": list(range(1000))}),
    )
    reader = _source(lake)

    assert reader.read_sql("SELECT count(*) AS n, sum(amount) AS total FROM orders") == [
        {"n": 1000, "total": 499500}
    ]
    with reader.connect(read_only=True) as connection:
        files = connection.execute(
            "SELECT path FROM __ducklake_metadata_lake.ducklake_data_file"
        ).fetchall()
        scopes = connection.execute("SELECT scope FROM duckdb_secrets()").fetchall()
    assert len(files) == 1
    assert scopes == [([data_file_prefix],)]
    return reader


@needs_ducklake
def test_a_ducklake_database_on_s3_storage_is_written_then_read(s3_store, tmp_path, monkeypatch):
    monkeypatch.setenv("LAKE_E2E_S3_SECRET", S3_ROOT_SECRET)
    lake = {
        "catalog": f"ducklake:{tmp_path / 'catalog.ducklake'}",
        "data_path": "s3://lake-bucket/lake/",
        "storage": s3_store,
    }

    reader = _write_then_read(lake, "s3://lake-bucket/lake/")

    monkeypatch.setenv("LAKE_E2E_S3_SECRET", "wrong-secret-5d1e")
    with pytest.raises(click.ClickException) as error:
        reader.read_sql("SELECT sum(amount) FROM orders")
    assert "403" in error.value.message
    assert "wrong-secret-5d1e" not in error.value.message


@needs_ducklake
def test_a_ducklake_database_on_azure_storage_is_written_then_read(
    azure_store, tmp_path, monkeypatch
):
    monkeypatch.setenv("LAKE_E2E_AZURE_CONNECTION", azure_store)
    lake = {
        "catalog": f"ducklake:{tmp_path / 'catalog.ducklake'}",
        "data_path": "az://lake/data/",
        "storage": {"type": "azure", "connection_string": "${env.LAKE_E2E_AZURE_CONNECTION}"},
    }

    reader = _write_then_read(lake, "az://lake/data/")

    wrong_key = base64.b64encode(b"wrong-key-5d1e").decode()
    monkeypatch.setenv("LAKE_E2E_AZURE_CONNECTION", azure_store.replace(AZURITE_KEY, wrong_key))
    with pytest.raises(click.ClickException) as error:
        reader.read_sql("SELECT sum(amount) FROM orders")
    assert "AuthorizationFailure" in error.value.message
    assert wrong_key not in error.value.message
