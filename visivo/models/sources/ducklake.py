import re
from typing import List, Literal, Optional, Union

from pydantic import Field, model_validator

from visivo.models.base.base_model import (
    BaseModel,
    IntOrEnvVar,
    SecretStrOrEnvVar,
    StringOrEnvVar,
)
from visivo.models.base.env_var_string import EnvVarString

DUCKLAKE_PREFIX = "ducklake:"
GCS_PREFIXES = ("gs://", "gcs://")
REDACTED = "***"

_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
_CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")
_CREDENTIAL_ASSIGNMENT = re.compile(
    r"(?i)\b(password|passwd|secret|key_id|token)(\s*=\s*)(\"[^\"]*\"|'[^']*'|[^\s;&]+)"
)
_URL_CREDENTIALS = re.compile(r"(://[^/\s:@]+:)[^@\s/]+@")


def validate_identifier(name: str, field: str = "schema_name") -> str:
    if not isinstance(name, str) or not _IDENTIFIER.match(name):
        raise ValueError(
            f"{field} must start with a letter or an underscore and contain only "
            "letters, numbers and underscores."
        )
    return name


def quote_identifier(name: str, field: str = "schema_name") -> str:
    return f'"{validate_identifier(name, field)}"'


def quote_literal(value, field: str) -> str:
    text = str(value)
    if _CONTROL_CHARACTERS.search(text):
        raise ValueError(f"{field} must not contain control characters.")
    return "'" + text.replace("'", "''") + "'"


def attach_database_sql(database: str, alias: str, options: Optional[List[str]] = None) -> str:
    statement = f"ATTACH {quote_literal(database, 'database')} AS {quote_identifier(alias)}"
    if options:
        statement += f" ({', '.join(options)})"
    return statement


def resolve_value(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, EnvVarString):
        return value.resolve()
    if hasattr(value, "get_secret_value"):
        return value.get_secret_value()
    return value


def redact(message: str, secrets: Optional[List[Optional[str]]] = None) -> str:
    """Remove secret values and credential assignments from an error message."""
    variants = set()
    for secret in secrets or []:
        if secret:
            variants.add(str(secret))
            variants.add(str(secret).replace("'", "''"))
    for variant in sorted(variants, key=len, reverse=True):
        message = message.replace(variant, REDACTED)
    message = _CREDENTIAL_ASSIGNMENT.sub(rf"\1\2{REDACTED}", message)
    return _URL_CREDENTIALS.sub(rf"\1{REDACTED}@", message)


def _check_catalog_uri(uri: str) -> str:
    if not uri.lower().startswith(DUCKLAKE_PREFIX) or len(uri) == len(DUCKLAKE_PREFIX):
        raise ValueError(
            "catalog must be a 'ducklake:' URI, for example 'ducklake:sqlite:catalog.sqlite', "
            "or a Postgres catalog with host, database and username."
        )
    if uri.lower().startswith(f"{DUCKLAKE_PREFIX}postgres:"):
        raise ValueError(
            "A Postgres catalog must use the catalog fields (host, port, database, username, "
            "password), not a URI, so that the password stays out of the connection string."
        )
    return uri


def _check_gcs_data_path(data_path: str) -> str:
    if not data_path.lower().startswith(GCS_PREFIXES):
        raise ValueError("gcs credentials need a data_path that starts with 'gs://' or 'gcs://'.")
    return data_path


class DuckLakePostgresCatalog(BaseModel):
    """
    The PostgreSQL database that holds the DuckLake catalog. The database must exist.
    """

    type: Literal["postgres"] = Field("postgres", description="The catalog database type.")
    host: StringOrEnvVar = Field(..., description="The host of the catalog database.")
    port: IntOrEnvVar = Field(5432, description="The port of the catalog database.")
    database: StringOrEnvVar = Field(..., description="The name of the catalog database.")
    username: StringOrEnvVar = Field(..., description="Username for the catalog database.")
    password: Optional[SecretStrOrEnvVar] = Field(
        None, description="Password corresponding to the username."
    )

    def get_port(self) -> int:
        port = resolve_value(self.port)
        try:
            port = int(port)
        except (TypeError, ValueError):
            raise ValueError("catalog port is not an integer.")
        if not 0 < port < 65536:
            raise ValueError("catalog port must be between 1 and 65535.")
        return port

    def secret_sql(self, secret_name: str) -> str:
        parameters = [
            "TYPE postgres",
            f"HOST {quote_literal(resolve_value(self.host), 'catalog host')}",
            f"PORT {self.get_port()}",
            f"DATABASE {quote_literal(resolve_value(self.database), 'catalog database')}",
            f"USER {quote_literal(resolve_value(self.username), 'catalog username')}",
        ]
        password = resolve_value(self.password)
        if password is not None:
            parameters.append(f"PASSWORD {quote_literal(password, 'catalog password')}")
        return (
            f"CREATE OR REPLACE TEMPORARY SECRET {quote_identifier(secret_name)} "
            f"({', '.join(parameters)})"
        )


class DuckLakeGcsCredentials(BaseModel):
    """
    An HMAC key for a Google Cloud Storage bucket. DuckDB does not accept a service
    account key file.
    """

    key_id: StringOrEnvVar = Field(..., description="The access id of the HMAC key.")
    secret: SecretStrOrEnvVar = Field(..., description="The secret of the HMAC key.")

    def secret_sql(self, secret_name: str, scope: Optional[str]) -> str:
        parameters = [
            "TYPE gcs",
            f"KEY_ID {quote_literal(resolve_value(self.key_id), 'gcs key_id')}",
            f"SECRET {quote_literal(resolve_value(self.secret), 'gcs secret')}",
        ]
        if scope:
            parameters.append(f"SCOPE {quote_literal(scope, 'data_path')}")
        return (
            f"CREATE OR REPLACE TEMPORARY SECRET {quote_identifier(secret_name)} "
            f"({', '.join(parameters)})"
        )


class DuckLakeAttachment(BaseModel):
    """
    A DuckLakeAttachment makes the tables of a [DuckLake](https://ducklake.select) available
    in the parent DuckDB source. A model reads a table as `lake.main.orders`, where `lake`
    is the `schema_name`.

    !!! example

        ``` yaml
        sources:
          - name: lake
            type: duckdb
            database: ":memory:"
            attach:
              - schema_name: lake
                ducklake:
                  catalog:
                    host: ${env.LAKE_HOST}
                    database: ducklake
                    username: ${env.LAKE_USER}
                    password: ${env.LAKE_PASSWORD}
                  data_path: gs://my-bucket/lake/
                  gcs:
                    key_id: ${env.GCS_HMAC_KEY_ID}
                    secret: ${env.GCS_HMAC_SECRET}
        ```

    For a catalog in a file, set `catalog: ducklake:sqlite:local/catalog.sqlite`.
    """

    catalog: Union[DuckLakePostgresCatalog, StringOrEnvVar] = Field(
        ...,
        description="A Postgres catalog, or a `ducklake:` URI for a catalog in a DuckDB or SQLite file.",
    )
    data_path: Optional[StringOrEnvVar] = Field(
        None,
        description="Where the DuckLake keeps its data files. An existing DuckLake does not need it.",
    )
    read_only: bool = Field(
        True, description="Attach the DuckLake read-only. Set to false to allow writes."
    )
    snapshot_version: Optional[int] = Field(
        None, ge=0, description="Read the DuckLake as of this snapshot, not the latest one."
    )
    gcs: Optional[DuckLakeGcsCredentials] = Field(
        None, description="The HMAC key that reads a `gs://` data path."
    )

    @model_validator(mode="after")
    def validate_ducklake(self):
        if isinstance(self.catalog, str):
            _check_catalog_uri(self.catalog)
        if self.snapshot_version is not None and not self.read_only:
            raise ValueError("snapshot_version needs read_only: true. A snapshot cannot change.")
        if self.gcs is not None and isinstance(self.data_path, str):
            _check_gcs_data_path(self.data_path)
        return self

    def secret_values(self) -> List[str]:
        """Resolved values that must never show in a log line or an error message."""
        candidates = []
        if isinstance(self.catalog, DuckLakePostgresCatalog):
            candidates.append(self.catalog.password)
        if self.gcs is not None:
            candidates.extend([self.gcs.secret, self.gcs.key_id])
        values = []
        for candidate in candidates:
            try:
                value = resolve_value(candidate)
            except Exception:
                continue
            if value:
                values.append(value)
        return values

    def setup_statements(self, alias: str) -> List[str]:
        """The CREATE SECRET and ATTACH statements, with values resolved at connect time."""
        quote_identifier(alias)
        statements = []
        options = []
        data_path = resolve_value(self.data_path)

        if isinstance(self.catalog, DuckLakePostgresCatalog):
            catalog_secret = f"visivo_{alias}_catalog"
            statements.append(self.catalog.secret_sql(catalog_secret))
            catalog_uri = f"{DUCKLAKE_PREFIX}postgres:"
            options.append(f"META_SECRET {quote_literal(catalog_secret, 'catalog secret')}")
        else:
            catalog_uri = _check_catalog_uri(resolve_value(self.catalog))

        if self.gcs is not None:
            if data_path:
                _check_gcs_data_path(data_path)
            statements.append(self.gcs.secret_sql(f"visivo_{alias}_storage", data_path))

        if data_path:
            options.append(f"DATA_PATH {quote_literal(data_path, 'data_path')}")
        if self.read_only:
            options.append("READ_ONLY")
        if self.snapshot_version is not None:
            options.append(f"SNAPSHOT_VERSION {int(self.snapshot_version)}")

        statements.append(attach_database_sql(catalog_uri, alias, options))
        return statements
