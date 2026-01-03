"""Tests for the EnvVarString class and source env var integration."""

import pytest
from pydantic import SecretStr
from visivo.models.base.env_var_string import EnvVarString
from visivo.parsers.env_var_resolver import MissingEnvVarError


class TestEnvVarString:
    """Tests for EnvVarString core functionality."""

    def test_creation(self):
        evs = EnvVarString("${env.MY_VAR}")
        assert evs.value == "${env.MY_VAR}"
        assert str(evs) == "${env.MY_VAR}"

    def test_repr(self):
        evs = EnvVarString("${env.MY_VAR}")
        assert repr(evs) == "EnvVarString('${env.MY_VAR}')"

    def test_equality(self):
        evs1 = EnvVarString("${env.MY_VAR}")
        evs2 = EnvVarString("${env.MY_VAR}")
        evs3 = EnvVarString("${env.OTHER_VAR}")

        assert evs1 == evs2
        assert evs1 != evs3
        assert evs1 != "not an EnvVarString"

    def test_hash(self):
        evs1 = EnvVarString("${env.MY_VAR}")
        evs2 = EnvVarString("${env.MY_VAR}")
        evs3 = EnvVarString("${env.OTHER_VAR}")

        assert hash(evs1) == hash(evs2)
        assert hash(evs1) != hash(evs3)

        # Should be usable in sets/dicts
        s = {evs1, evs2, evs3}
        assert len(s) == 2

    def test_get_env_var_names_single(self):
        evs = EnvVarString("${env.MY_VAR}")
        assert evs.get_env_var_names() == ["MY_VAR"]

    def test_get_env_var_names_multiple(self):
        evs = EnvVarString("${env.HOST}:${env.PORT}")
        assert set(evs.get_env_var_names()) == {"HOST", "PORT"}

    def test_get_env_var_names_embedded(self):
        evs = EnvVarString("prefix-${env.REGION}-suffix")
        assert evs.get_env_var_names() == ["REGION"]

    def test_resolve_single(self, monkeypatch):
        monkeypatch.setenv("MY_VAR", "secret_value")
        evs = EnvVarString("${env.MY_VAR}")
        assert evs.resolve() == "secret_value"

    def test_resolve_embedded(self, monkeypatch):
        monkeypatch.setenv("REGION", "us-west")
        evs = EnvVarString("db-${env.REGION}.example.com")
        assert evs.resolve() == "db-us-west.example.com"

    def test_resolve_multiple(self, monkeypatch):
        monkeypatch.setenv("HOST", "localhost")
        monkeypatch.setenv("PORT", "5432")
        evs = EnvVarString("${env.HOST}:${env.PORT}")
        assert evs.resolve() == "localhost:5432"

    def test_resolve_missing_raises(self):
        evs = EnvVarString("${env.NONEXISTENT_VAR}")
        with pytest.raises(MissingEnvVarError) as exc_info:
            evs.resolve()
        assert exc_info.value.var_name == "NONEXISTENT_VAR"

    def test_resolve_missing_no_raise(self):
        evs = EnvVarString("${env.NONEXISTENT_VAR}")
        result = evs.resolve(raise_on_missing=False)
        assert result == "${env.NONEXISTENT_VAR}"

    def test_resolve_partial_missing_no_raise(self, monkeypatch):
        monkeypatch.setenv("HOST", "localhost")
        evs = EnvVarString("${env.HOST}:${env.MISSING_PORT}")
        result = evs.resolve(raise_on_missing=False)
        assert result == "localhost:${env.MISSING_PORT}"

    def test_is_fully_set_all_set(self, monkeypatch):
        monkeypatch.setenv("A", "1")
        monkeypatch.setenv("B", "2")
        evs = EnvVarString("${env.A}:${env.B}")
        assert evs.is_fully_set()

    def test_is_fully_set_partial(self, monkeypatch):
        monkeypatch.setenv("A", "1")
        evs = EnvVarString("${env.A}:${env.B}")
        assert not evs.is_fully_set()

    def test_is_fully_set_none_set(self):
        evs = EnvVarString("${env.A}:${env.B}")
        assert not evs.is_fully_set()

    def test_contains_env_var_with_instance(self):
        evs = EnvVarString("${env.VAR}")
        assert EnvVarString.contains_env_var(evs)

    def test_contains_env_var_with_string(self):
        assert EnvVarString.contains_env_var("${env.VAR}")
        assert EnvVarString.contains_env_var("prefix-${env.VAR}-suffix")
        assert not EnvVarString.contains_env_var("no env var here")

    def test_contains_env_var_with_other_types(self):
        assert not EnvVarString.contains_env_var(123)
        assert not EnvVarString.contains_env_var(None)
        assert not EnvVarString.contains_env_var([])

    def test_whitespace_in_pattern(self, monkeypatch):
        monkeypatch.setenv("MY_VAR", "value")
        evs = EnvVarString("${ env.MY_VAR }")
        assert evs.resolve() == "value"


class TestEnvVarStringPydanticIntegration:
    """Tests for Pydantic validation and serialization."""

    def test_pydantic_validation_valid(self):
        from pydantic import BaseModel

        class TestModel(BaseModel):
            value: EnvVarString

        model = TestModel(value="${env.MY_VAR}")
        assert isinstance(model.value, EnvVarString)
        assert str(model.value) == "${env.MY_VAR}"

    def test_pydantic_validation_invalid(self):
        from pydantic import BaseModel, ValidationError

        class TestModel(BaseModel):
            value: EnvVarString

        with pytest.raises(ValidationError):
            TestModel(value="no env var pattern")

    def test_pydantic_serialization(self):
        from pydantic import BaseModel

        class TestModel(BaseModel):
            value: EnvVarString

        model = TestModel(value="${env.MY_VAR}")
        data = model.model_dump(mode="json")
        assert data["value"] == "${env.MY_VAR}"


class TestSourceEnvVarIntegration:
    """Tests for env var support in source models."""

    def test_postgresql_password_env_var(self, monkeypatch):
        from visivo.models.sources.postgresql_source import PostgresqlSource

        monkeypatch.setenv("DB_PASS", "secret123")

        source = PostgresqlSource(
            name="test",
            type="postgresql",
            host="localhost",
            database="testdb",
            password="${env.DB_PASS}",
        )

        assert isinstance(source.password, EnvVarString)
        assert str(source.password) == "${env.DB_PASS}"
        assert source.get_password() == "secret123"

    def test_postgresql_password_literal(self):
        from visivo.models.sources.postgresql_source import PostgresqlSource

        source = PostgresqlSource(
            name="test",
            type="postgresql",
            host="localhost",
            database="testdb",
            password="literal_password",
        )

        assert isinstance(source.password, SecretStr)
        assert source.get_password() == "literal_password"

    def test_host_embedded_env_var(self, monkeypatch):
        from visivo.models.sources.postgresql_source import PostgresqlSource

        monkeypatch.setenv("ENV", "prod")

        source = PostgresqlSource(
            name="test",
            type="postgresql",
            host="db-${env.ENV}.example.com",
            database="testdb",
        )

        assert isinstance(source.host, EnvVarString)
        assert source.get_host() == "db-prod.example.com"

    def test_database_env_var(self, monkeypatch):
        from visivo.models.sources.postgresql_source import PostgresqlSource

        monkeypatch.setenv("DB_NAME", "production_db")

        source = PostgresqlSource(
            name="test",
            type="postgresql",
            host="localhost",
            database="${env.DB_NAME}",
        )

        assert isinstance(source.database, EnvVarString)
        assert source.get_database() == "production_db"

    def test_multiple_env_vars_in_source(self, monkeypatch):
        from visivo.models.sources.postgresql_source import PostgresqlSource

        monkeypatch.setenv("DB_HOST", "localhost")
        monkeypatch.setenv("DB_NAME", "testdb")
        monkeypatch.setenv("DB_USER", "admin")
        monkeypatch.setenv("DB_PASS", "secret")

        source = PostgresqlSource(
            name="test",
            type="postgresql",
            host="${env.DB_HOST}",
            database="${env.DB_NAME}",
            username="${env.DB_USER}",
            password="${env.DB_PASS}",
        )

        assert source.get_host() == "localhost"
        assert source.get_database() == "testdb"
        assert source.get_username() == "admin"
        assert source.get_password() == "secret"

    def test_serialization_preserves_env_var_syntax(self, monkeypatch):
        from visivo.models.sources.postgresql_source import PostgresqlSource

        monkeypatch.setenv("DB_PASS", "secret")

        source = PostgresqlSource(
            name="test",
            type="postgresql",
            host="localhost",
            database="testdb",
            password="${env.DB_PASS}",
        )

        data = source.model_dump(mode="json")
        # Should preserve the env var syntax, not resolve it
        assert data["password"] == "${env.DB_PASS}"

    def test_missing_env_var_at_resolution(self):
        from visivo.models.sources.postgresql_source import PostgresqlSource

        source = PostgresqlSource(
            name="test",
            type="postgresql",
            host="localhost",
            database="testdb",
            password="${env.MISSING_VAR}",
        )

        # Should be able to create the model
        assert isinstance(source.password, EnvVarString)

        # But resolution should fail
        with pytest.raises(MissingEnvVarError):
            source.get_password()


class TestSnowflakeEnvVars:
    """Tests for Snowflake source env var support."""

    def test_private_key_passphrase_env_var(self, monkeypatch):
        from visivo.models.sources.snowflake_source import SnowflakeSource

        monkeypatch.setenv("PK_PASS", "passphrase123")

        source = SnowflakeSource(
            name="test",
            type="snowflake",
            account="test.us-west-1.aws",
            database="testdb",
            warehouse="test_wh",
            private_key_passphrase="${env.PK_PASS}",
        )

        assert isinstance(source.private_key_passphrase, EnvVarString)
        assert source.get_private_key_passphrase() == "passphrase123"


class TestBigQueryEnvVars:
    """Tests for BigQuery source env var support."""

    def test_credentials_base64_env_var(self, monkeypatch):
        from visivo.models.sources.bigquery_source import BigQuerySource

        monkeypatch.setenv("BQ_CREDS", "base64encodedcredentials")

        source = BigQuerySource(
            name="test",
            type="bigquery",
            project="my-project",
            credentials_base64="${env.BQ_CREDS}",
        )

        assert isinstance(source.credentials_base64, EnvVarString)
        assert source.get_credentials_base64() == "base64encodedcredentials"

    def test_project_env_var(self, monkeypatch):
        from visivo.models.sources.bigquery_source import BigQuerySource

        monkeypatch.setenv("GCP_PROJECT", "my-gcp-project")
        monkeypatch.setenv("GOOGLE_APPLICATION_CREDENTIALS", "/path/to/creds.json")

        source = BigQuerySource(
            name="test",
            type="bigquery",
            project="${env.GCP_PROJECT}",
        )

        assert isinstance(source.project, EnvVarString)
        assert source.get_project() == "my-gcp-project"
