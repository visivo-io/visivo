import re
from typing import ClassVar, List, Literal, Optional, Tuple, Union

from pydantic import Field, ValidationError, field_validator, model_validator
from typing_extensions import Annotated

from visivo.models.base.base_model import (
    BaseModel,
    IntOrEnvVar,
    StringOrEnvVar,
)
from visivo.models.base.env_var_string import EnvVarString
from visivo.models.sources.database_file import (
    DUCKLAKE_PREFIX,
    FILE_CATALOG_PREFIXES,
    NON_FILE_SCHEME,
)

REDACTED = "***"

_CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")
_CREDENTIAL_ASSIGNMENT = re.compile(
    r"(?i)([a-z0-9_]*(?:password|passwd|secret|token|key|signature)[a-z0-9_]*|(?<![a-z])sig)"
    r"(\s*=\s*)(\"[^\"]*\"|'[^']*'|[^\s;&]+)"
)
_URL_AUTHORITY = re.compile(r"^[A-Za-z][A-Za-z0-9+.-]*://([^/]*)")
# abfss://<container>@<account>.dfs.core.windows.net/ names a container, not a user.
_CONTAINER_AT_ACCOUNT_SCHEMES = ("abfss://", "abfs://")
# DuckDB prints a URL a second time as a path, with '://' collapsed to ':/'.
_URL_CREDENTIALS = re.compile(r"(:/+[^/\s:@]+:)[^@\s/]+@")


def validate_identifier(name: str, field: str = "schema_name") -> str:
    """Visivo writes the name inside double quotes, so only a quote can end it."""
    if (
        not isinstance(name, str)
        or not name.strip()
        or '"' in name
        or _CONTROL_CHARACTERS.search(name)
    ):
        raise ValueError(
            f"{field} must not be empty and must not contain a double quote or a "
            "control character."
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


def validation_error_text(error: ValidationError) -> str:
    """The text of a validation error with no input value in it. Pydantic repeats the
    input in `str(error)`, and the input can hold a secret under any key."""
    lines = error.errors(include_input=False, include_url=False, include_context=False)
    count = len(lines)
    text = [f"{count} validation error{'' if count == 1 else 's'} for {error.title}"]
    for line in lines:
        text.append(".".join(str(part) for part in line.get("loc") or ()))
        text.append(f"  {line.get('msg')} [type={line.get('type')}]")
    return redact("\n".join(text))


def is_ducklake_uri(value) -> bool:
    return isinstance(value, str) and value.lower().startswith(DUCKLAKE_PREFIX)


def check_ducklake_uri(uri: str, field: str = "catalog") -> str:
    """Accept only a catalog in a file: `ducklake:<path>`, `ducklake:sqlite:<path>` or
    `ducklake:duckdb:<path>`. Any other form can hold a credential."""
    if not is_ducklake_uri(uri) or len(uri) == len(DUCKLAKE_PREFIX):
        raise ValueError(
            f"{field} must be a 'ducklake:' URI, for example 'ducklake:sqlite:catalog.sqlite', "
            "or a Postgres catalog with host, database and username."
        )
    path = uri[len(DUCKLAKE_PREFIX) :]
    if path.lower().startswith("postgres:"):
        raise ValueError(
            "A Postgres catalog must use the catalog fields (host, port, database, username, "
            "password), not a URI, so that the password stays out of the connection string."
        )
    if path.lower().startswith(FILE_CATALOG_PREFIXES):
        path = path.split(":", 1)[1]
    if (
        NON_FILE_SCHEME.match(path)
        or "://" in path
        or "@" in path
        or _CREDENTIAL_ASSIGNMENT.search(path)
    ):
        raise ValueError(
            f"A 'ducklake:' URI in {field} must name a catalog in a DuckDB or SQLite file, "
            "for example 'ducklake:sqlite:catalog.sqlite'. Visivo refuses a URI that can "
            "hold credentials."
        )
    return uri


def check_data_path(data_path: str) -> str:
    """Refuse a data path that can hold credentials. They go in the `storage` block."""
    url = _URL_AUTHORITY.match(data_path)
    authority = url.group(1) if url else ""
    user_info = authority.rpartition("@")[0]
    container = data_path.lower().startswith(_CONTAINER_AT_ACCOUNT_SCHEMES) and ":" not in user_info
    # A password can hold a '/', so the '@' can come after the first path segment.
    password = ":" in authority and "@" in data_path[url.end() :] if url else False
    if (
        (url and "?" in data_path)
        or (user_info and not container)
        or password
        or _CREDENTIAL_ASSIGNMENT.search(data_path)
    ):
        raise ValueError(
            "data_path must not hold credentials or a query string. Put the credentials "
            "in the storage block, as ${env.VAR} references."
        )
    return data_path


def _env_var_reference(value, field: str, example: str):
    if value is None or EnvVarString.contains_pattern(value):
        return value
    raise ValueError(
        f"{field} must be an environment variable reference, for example ${{env.{example}}}. "
        "Visivo does not accept the value itself here."
    )


def create_secret_sql(secret_name: str, parameters: List[str], scope: Optional[str]) -> str:
    if scope:
        parameters = parameters + [f"SCOPE {quote_literal(scope, 'data_path')}"]
    return (
        f"CREATE OR REPLACE TEMPORARY SECRET {quote_identifier(secret_name)} "
        f"({', '.join(parameters)})"
    )


class DuckLakePostgresCatalog(BaseModel):
    """
    The PostgreSQL database that holds the DuckLake catalog. The database must exist.
    """

    type: Literal["postgres"] = Field("postgres", description="The catalog database type.")
    host: StringOrEnvVar = Field(..., description="The host of the catalog database.")
    port: IntOrEnvVar = Field(5432, description="The port of the catalog database.")
    database: StringOrEnvVar = Field(..., description="The name of the catalog database.")
    username: StringOrEnvVar = Field(..., description="Username for the catalog database.")
    password: Optional[EnvVarString] = Field(
        None,
        description="Password corresponding to the username. It must be a `${env.VAR}` reference.",
    )

    @field_validator("password", mode="before")
    @classmethod
    def validate_password(cls, password):
        return _env_var_reference(password, "catalog password", "LAKE_CATALOG_PASSWORD")

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
        return create_secret_sql(secret_name, parameters, None)


class DuckLakeStorage(BaseModel):
    """The credentials for the object store that holds the data files of a DuckLake."""

    schemes: ClassVar[Tuple[str, ...]] = ()

    def check_data_path(self, data_path: str) -> str:
        if not data_path.lower().startswith(self.schemes):
            expected = " or ".join(f"'{scheme}'" for scheme in self.schemes)
            raise ValueError(
                f"storage type '{self.type}' needs a data_path that starts with {expected}."
            )
        return data_path

    def secret_parameters(self) -> List[str]:
        raise NotImplementedError

    def secret_candidates(self) -> list:
        return []

    def secret_sql(self, secret_name: str, scope: Optional[str]) -> str:
        return create_secret_sql(secret_name, self.secret_parameters(), scope)


class DuckLakeGcsStorage(DuckLakeStorage):
    """
    An HMAC key for a Google Cloud Storage bucket. DuckDB does not accept a service
    account key file. The `data_path` starts with `gs://` or `gcs://`.
    """

    schemes: ClassVar[Tuple[str, ...]] = ("gs://", "gcs://")

    type: Literal["gcs"] = Field(..., description="Google Cloud Storage.")
    key_id: StringOrEnvVar = Field(..., description="The access id of the HMAC key.")
    secret: EnvVarString = Field(
        ...,
        description="The secret of the HMAC key. It must be a `${env.VAR}` reference.",
    )

    @field_validator("secret", mode="before")
    @classmethod
    def validate_secret(cls, secret):
        return _env_var_reference(secret, "gcs secret", "GCS_HMAC_SECRET")

    def secret_candidates(self) -> list:
        return [self.secret, self.key_id]

    def secret_parameters(self) -> List[str]:
        return [
            "TYPE gcs",
            f"KEY_ID {quote_literal(resolve_value(self.key_id), 'gcs key_id')}",
            f"SECRET {quote_literal(resolve_value(self.secret), 'gcs secret')}",
        ]


class DuckLakeS3Storage(DuckLakeStorage):
    """
    An access key for Amazon S3 or for an S3-compatible object store. Set `endpoint`,
    and usually `url_style: path`, for a store that is not Amazon S3. The `data_path`
    starts with `s3://` (`s3a://` and `s3n://` are also accepted).
    """

    schemes: ClassVar[Tuple[str, ...]] = ("s3://", "s3a://", "s3n://")

    type: Literal["s3"] = Field(..., description="Amazon S3 or an S3-compatible store.")
    key_id: StringOrEnvVar = Field(..., description="The access key id.")
    secret: EnvVarString = Field(
        ...,
        description="The secret access key. It must be a `${env.VAR}` reference.",
    )
    region: Optional[StringOrEnvVar] = Field(
        None, description="The region of the bucket, for example `us-east-1`."
    )
    endpoint: Optional[StringOrEnvVar] = Field(
        None,
        description="The host, and optional port, of an S3-compatible store, for example `minio.internal:9000`. Do not include `https://`.",
    )
    session_token: Optional[EnvVarString] = Field(
        None,
        description="The session token of temporary credentials. It must be a `${env.VAR}` reference.",
    )
    url_style: Optional[Literal["vhost", "path"]] = Field(
        None,
        description="How the bucket is addressed: `vhost` (the DuckDB default for S3) or `path`.",
    )
    use_ssl: Optional[bool] = Field(
        None, description="Set to false for a store that is served over http."
    )

    @field_validator("secret", mode="before")
    @classmethod
    def validate_secret(cls, secret):
        return _env_var_reference(secret, "s3 secret", "AWS_SECRET_ACCESS_KEY")

    @field_validator("session_token", mode="before")
    @classmethod
    def validate_session_token(cls, session_token):
        return _env_var_reference(session_token, "s3 session_token", "AWS_SESSION_TOKEN")

    def secret_candidates(self) -> list:
        return [self.secret, self.session_token, self.key_id]

    def secret_parameters(self) -> List[str]:
        parameters = [
            "TYPE s3",
            f"KEY_ID {quote_literal(resolve_value(self.key_id), 's3 key_id')}",
            f"SECRET {quote_literal(resolve_value(self.secret), 's3 secret')}",
        ]
        for keyword, value in (
            ("REGION", self.region),
            ("ENDPOINT", self.endpoint),
            ("SESSION_TOKEN", self.session_token),
            ("URL_STYLE", self.url_style),
        ):
            value = resolve_value(value)
            if value is not None:
                parameters.append(f"{keyword} {quote_literal(value, f's3 {keyword.lower()}')}")
        if self.use_ssl is not None:
            parameters.append(f"USE_SSL {'true' if self.use_ssl else 'false'}")
        return parameters


class DuckLakeAzureStorage(DuckLakeStorage):
    """
    Credentials for Azure Blob Storage or ADLS. Set `connection_string`, or `account_name`
    with `tenant_id`, `client_id` and `client_secret` (a service principal), or
    `account_name` only (the Azure credential chain of the machine). The `data_path`
    starts with `az://` or `abfss://` (`azure://` and `abfs://` are also accepted).
    """

    schemes: ClassVar[Tuple[str, ...]] = ("az://", "azure://", "abfss://", "abfs://")

    type: Literal["azure"] = Field(..., description="Azure Blob Storage or ADLS.")
    connection_string: Optional[EnvVarString] = Field(
        None,
        description="The connection string of the storage account. It must be a `${env.VAR}` reference.",
    )
    account_name: Optional[StringOrEnvVar] = Field(
        None, description="The name of the storage account."
    )
    tenant_id: Optional[StringOrEnvVar] = Field(
        None, description="The tenant of the service principal."
    )
    client_id: Optional[StringOrEnvVar] = Field(
        None, description="The client id of the service principal."
    )
    client_secret: Optional[EnvVarString] = Field(
        None,
        description="The client secret of the service principal. It must be a `${env.VAR}` reference.",
    )

    @field_validator("connection_string", mode="before")
    @classmethod
    def validate_connection_string(cls, connection_string):
        return _env_var_reference(
            connection_string, "azure connection_string", "AZURE_STORAGE_CONNECTION_STRING"
        )

    @field_validator("client_secret", mode="before")
    @classmethod
    def validate_client_secret(cls, client_secret):
        return _env_var_reference(client_secret, "azure client_secret", "AZURE_CLIENT_SECRET")

    @model_validator(mode="after")
    def validate_credentials(self):
        principal = [self.tenant_id, self.client_id, self.client_secret]
        if self.connection_string is not None:
            if self.account_name is not None or any(value is not None for value in principal):
                raise ValueError(
                    "azure storage takes a connection_string or an account_name, not both."
                )
        elif self.account_name is None:
            raise ValueError("azure storage needs a connection_string or an account_name.")
        elif any(value is not None for value in principal) and None in principal:
            raise ValueError(
                "An azure service principal needs tenant_id, client_id and client_secret."
            )
        return self

    def secret_candidates(self) -> list:
        return [self.connection_string, self.client_secret]

    def secret_parameters(self) -> List[str]:
        if self.connection_string is not None:
            connection_string = resolve_value(self.connection_string)
            return [
                "TYPE azure",
                f"CONNECTION_STRING {quote_literal(connection_string, 'azure connection_string')}",
            ]
        account = (
            f"ACCOUNT_NAME {quote_literal(resolve_value(self.account_name), 'azure account_name')}"
        )
        if self.client_secret is None:
            return ["TYPE azure", "PROVIDER credential_chain", account]
        return [
            "TYPE azure",
            "PROVIDER service_principal",
            f"TENANT_ID {quote_literal(resolve_value(self.tenant_id), 'azure tenant_id')}",
            f"CLIENT_ID {quote_literal(resolve_value(self.client_id), 'azure client_id')}",
            f"CLIENT_SECRET {quote_literal(resolve_value(self.client_secret), 'azure client_secret')}",
            account,
        ]


DuckLakeStorageField = Annotated[
    Union[DuckLakeGcsStorage, DuckLakeS3Storage, DuckLakeAzureStorage],
    Field(discriminator="type"),
]

_CONNECTION_STRING_SECRETS = re.compile(r"(?i)(?:accountkey|sharedaccesssignature)=([^;]+)")


class DuckLake(BaseModel):
    """
    A [DuckLake](https://ducklake.select): a catalog database plus data files. It is the
    `database` of a DuckDB source, or the `ducklake` block of an attachment.

    !!! example

        ``` yaml
        sources:
          - name: lake
            type: duckdb
            database:
              catalog:
                host: ${env.LAKE_HOST}
                database: ducklake
                username: ${env.LAKE_USER}
                password: ${env.LAKE_PASSWORD}
              data_path: s3://my-bucket/lake/
              storage:
                type: s3
                key_id: ${env.AWS_ACCESS_KEY_ID}
                secret: ${env.AWS_SECRET_ACCESS_KEY}
                region: us-east-1
        ```

    For a catalog in a file, set `catalog: ducklake:sqlite:local/catalog.sqlite`.
    """

    catalog: Union[DuckLakePostgresCatalog, StringOrEnvVar] = Field(
        ...,
        description="A Postgres catalog, or a `ducklake:` URI for a catalog in a DuckDB or SQLite file.",
    )
    data_path: Optional[StringOrEnvVar] = Field(
        None,
        description="Where the DuckLake keeps its data files. An existing DuckLake does not need it. With `storage` it is also the scope of the credentials, and it is necessary when more than one DuckLake of a source has `storage`.",
    )
    read_only: bool = Field(
        True, description="Attach the DuckLake read-only. Set to false to allow writes."
    )
    snapshot_version: Optional[int] = Field(
        None, ge=0, description="Read the DuckLake as of this snapshot, not the latest one."
    )
    storage: Optional[DuckLakeStorageField] = Field(
        None,
        description="The credentials that read the data path: `type: gcs`, `type: s3` or `type: azure`. A local path or a public bucket does not need it.",
    )

    @model_validator(mode="after")
    def validate_ducklake(self):
        if isinstance(self.catalog, str):
            check_ducklake_uri(self.catalog)
        if self.snapshot_version is not None and not self.read_only:
            raise ValueError("snapshot_version needs read_only: true. A snapshot cannot change.")
        if isinstance(self.data_path, str):
            check_data_path(self.data_path)
            if self.storage is not None:
                self.storage.check_data_path(self.data_path)
        return self

    def secret_values(self) -> List[str]:
        """Resolved values that must never show in a log line or an error message."""
        candidates = []
        if isinstance(self.catalog, DuckLakePostgresCatalog):
            candidates.append(self.catalog.password)
        if self.storage is not None:
            candidates.extend(self.storage.secret_candidates())
        values = []
        for candidate in candidates:
            try:
                value = resolve_value(candidate)
            except Exception:
                continue
            if value:
                values.append(value)
                values.extend(_CONNECTION_STRING_SECRETS.findall(value))
        return values

    def catalog_uri(self) -> str:
        """The string that ATTACH receives. It holds no credential."""
        if isinstance(self.catalog, DuckLakePostgresCatalog):
            return f"{DUCKLAKE_PREFIX}postgres:"
        return check_ducklake_uri(resolve_value(self.catalog))

    def describe(self) -> str:
        """The catalog and the data path as written, for a log line."""
        catalog = (
            f"{DUCKLAKE_PREFIX}postgres:"
            if isinstance(self.catalog, DuckLakePostgresCatalog)
            else str(self.catalog)
        )
        data_path = f", data_path {self.data_path}" if self.data_path else ""
        return redact(f"DuckLake {catalog}{data_path}")

    def setup_statements(self, alias: str) -> List[str]:
        """The CREATE SECRET and ATTACH statements, with values resolved at connect time."""
        quote_identifier(alias)
        statements = []
        options = []
        data_path = resolve_value(self.data_path)
        if data_path:
            check_data_path(data_path)

        if isinstance(self.catalog, DuckLakePostgresCatalog):
            catalog_secret = f"visivo_{alias}_catalog"
            statements.append(self.catalog.secret_sql(catalog_secret))
            options.append(f"META_SECRET {quote_literal(catalog_secret, 'catalog secret')}")
        catalog_uri = self.catalog_uri()

        if self.storage is not None:
            if data_path:
                self.storage.check_data_path(data_path)
            statements.append(self.storage.secret_sql(f"visivo_{alias}_storage", data_path))

        if data_path:
            options.append(f"DATA_PATH {quote_literal(data_path, 'data_path')}")
        if self.read_only:
            options.append("READ_ONLY")
        if self.snapshot_version is not None:
            options.append(f"SNAPSHOT_VERSION {int(self.snapshot_version)}")

        statements.append(attach_database_sql(catalog_uri, alias, options))
        return statements
