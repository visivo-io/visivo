"""Credential protection on the SourceManager save path (Workspace source save).

The commit path serializes cached sources with ``model_dump(mode="json")``,
which renders any plaintext SecretStr as the literal ``**********`` mask.
Before these guards, a source saved from the Workspace either leaked its
password into YAML or — when the frontend round-tripped the API's masked
echo — wrote the mask literal into project.visivo.yml, silently destroying
the credential.
"""

import os

import pytest
from pydantic import SecretStr

from tests.factories.model_factories import (
    BigQuerySourceFactory,
    RedshiftSourceFactory,
    SnowflakeSourceFactory,
)
from visivo.models.base.env_var_string import EnvVarString
from visivo.server.managers.object_manager import ObjectStatus
from visivo.server.managers.source_manager import SourceManager
from visivo.server.source_credentials import SECRET_MASK


@pytest.fixture(autouse=True)
def restore_environ():
    """Externalisation mutates os.environ directly; snapshot and restore."""
    snapshot = dict(os.environ)
    yield
    os.environ.clear()
    os.environ.update(snapshot)


def redshift_config(**overrides):
    """A POST body as the Workspace source form sends it."""
    config = {
        "name": "warehouse",
        "type": "redshift",
        "host": "test-cluster.example.amazonaws.com",
        "port": 5439,
        "database": "test_db",
        "username": "test_user",
        "password": "hunter2",
    }
    config.update(overrides)
    return config


def commit_serialization(source):
    """Exactly how commit_views._build_child_info dumps a cached source
    before ProjectWriter writes it into project YAML."""
    return source.model_dump(mode="json", exclude_none=True, exclude={"path", "file_path"})


class TestSecretMaskSentinel:
    def test_mask_matches_what_the_api_echoes_for_stored_secrets(self):
        """SECRET_MASK must be byte-identical to the masked password the
        sources API returns (via _serialize_object's model_dump(mode="json")),
        because that is the exact literal the frontend round-trips on save."""
        source = RedshiftSourceFactory()
        assert source.model_dump(mode="json")["password"] == SECRET_MASK
        assert SECRET_MASK == "**********"


class TestNewPlaintextSecretExternalized:
    def test_password_moves_to_env_file_with_ref_in_config(self, tmp_path):
        manager = SourceManager(project_dir=str(tmp_path))

        source = manager.save_from_config(redshift_config())

        assert isinstance(source.password, EnvVarString)
        assert str(source.password) == "${env.WAREHOUSE_PASSWORD}"
        env_content = (tmp_path / ".env").read_text()
        assert "WAREHOUSE_PASSWORD=hunter2" in env_content
        # Resolvable immediately in the running server process.
        assert os.environ["WAREHOUSE_PASSWORD"] == "hunter2"
        # What a commit would write: the ref — never the plaintext, never the mask.
        dumped = commit_serialization(manager.cached_objects["warehouse"])
        assert dumped["password"] == "${env.WAREHOUSE_PASSWORD}"
        assert "hunter2" not in str(dumped)
        assert SECRET_MASK not in str(dumped)

    def test_snowflake_password_and_private_key_passphrase_both_externalized(self, tmp_path):
        manager = SourceManager(project_dir=str(tmp_path))
        config = {
            "name": "snow",
            "type": "snowflake",
            "account": "my-account",
            "database": "analytics",
            "username": "svc",
            "password": "snowpass",
            "private_key_path": "keys/rsa_key.p8",
            "private_key_passphrase": "passphrase-secret",
        }

        source = manager.save_from_config(config)

        assert str(source.password) == "${env.SNOW_PASSWORD}"
        assert str(source.private_key_passphrase) == "${env.SNOW_PRIVATE_KEY_PASSPHRASE}"
        env_content = (tmp_path / ".env").read_text()
        assert "SNOW_PASSWORD=snowpass" in env_content
        assert "SNOW_PRIVATE_KEY_PASSPHRASE=passphrase-secret" in env_content
        dumped = commit_serialization(source)
        assert "snowpass" not in str(dumped)
        assert "passphrase-secret" not in str(dumped)
        assert SECRET_MASK not in str(dumped)
        # Non-secret path field stays a plain literal.
        assert dumped["private_key_path"] == "keys/rsa_key.p8"

    def test_bigquery_credentials_base64_externalized(self, tmp_path):
        manager = SourceManager(project_dir=str(tmp_path))
        config = {
            "name": "bq",
            "type": "bigquery",
            "project": "test-project",
            "database": "test_dataset",
            "credentials_base64": "c2VydmljZS1hY2NvdW50LWpzb24=",
        }

        source = manager.save_from_config(config)

        assert str(source.credentials_base64) == "${env.BQ_CREDENTIALS_BASE64}"
        env_content = (tmp_path / ".env").read_text()
        assert "BQ_CREDENTIALS_BASE64=c2VydmljZS1hY2NvdW50LWpzb24=" in env_content
        assert "c2VydmljZS1hY2NvdW50LWpzb24=" not in str(commit_serialization(source))

    def test_changed_plaintext_secret_updates_env_value(self, tmp_path):
        manager = SourceManager(project_dir=str(tmp_path))
        manager.save_from_config(redshift_config())
        assert os.environ["WAREHOUSE_PASSWORD"] == "hunter2"

        source = manager.save_from_config(redshift_config(password="rotated-pass"))

        assert str(source.password) == "${env.WAREHOUSE_PASSWORD}"
        env_content = (tmp_path / ".env").read_text()
        assert "WAREHOUSE_PASSWORD=rotated-pass" in env_content
        assert "hunter2" not in env_content
        assert os.environ["WAREHOUSE_PASSWORD"] == "rotated-pass"

    def test_env_file_merge_preserves_unrelated_entries(self, tmp_path):
        (tmp_path / ".env").write_text("# my vars\nOTHER_API_KEY=abc123\n")
        manager = SourceManager(project_dir=str(tmp_path))

        manager.save_from_config(redshift_config())

        env_content = (tmp_path / ".env").read_text()
        assert "# my vars" in env_content
        assert "OTHER_API_KEY=abc123" in env_content
        assert "WAREHOUSE_PASSWORD=hunter2" in env_content


class TestMaskPreservation:
    def test_masked_password_preserves_existing_env_var_ref(self, tmp_path):
        manager = SourceManager(project_dir=str(tmp_path))
        published = RedshiftSourceFactory(name="warehouse", password="${env.MY_CUSTOM_SECRET}")
        manager._published_objects["warehouse"] = published

        source = manager.save_from_config(
            redshift_config(password=SECRET_MASK, host="new-host.example.com")
        )

        assert isinstance(source.password, EnvVarString)
        assert str(source.password) == "${env.MY_CUSTOM_SECRET}"
        assert source.host == "new-host.example.com"
        assert manager.get_status("warehouse") == ObjectStatus.MODIFIED
        # Nothing new to externalize — no .env is written.
        assert not (tmp_path / ".env").exists()

    def test_masked_password_preserves_existing_literal_value(self, tmp_path):
        """Published YAML holds a literal password; the user edits the port and
        the frontend round-trips the masked password. The real value must
        survive — externalized to .env with a ref in its place, because the
        commit will re-serialize this source into YAML (where a plaintext
        SecretStr would be destroyed into the mask)."""
        manager = SourceManager(project_dir=str(tmp_path))
        published = RedshiftSourceFactory(name="warehouse", password="hunter2")
        manager._published_objects["warehouse"] = published

        source = manager.save_from_config(redshift_config(password=SECRET_MASK, port=5440))

        assert source.port == 5440
        assert str(source.password) == "${env.WAREHOUSE_PASSWORD}"
        assert "WAREHOUSE_PASSWORD=hunter2" in (tmp_path / ".env").read_text()
        assert os.environ["WAREHOUSE_PASSWORD"] == "hunter2"
        dumped = commit_serialization(source)
        assert dumped["password"] == "${env.WAREHOUSE_PASSWORD}"
        assert SECRET_MASK not in str(dumped)

    def test_masked_password_on_noop_save_keeps_literal_untouched(self, tmp_path):
        """A save that changes nothing must not rewrite the YAML: the stored
        literal is preserved as-is and the source stays PUBLISHED (so the
        commit never re-serializes it)."""
        manager = SourceManager(project_dir=str(tmp_path))
        published = RedshiftSourceFactory(name="warehouse", password="hunter2")
        manager._published_objects["warehouse"] = published

        source = manager.save_from_config(redshift_config(password=SECRET_MASK))

        assert isinstance(source.password, SecretStr)
        assert source.password.get_secret_value() == "hunter2"
        assert manager.get_status("warehouse") == ObjectStatus.PUBLISHED
        assert not (tmp_path / ".env").exists()

    def test_masked_password_preserves_value_from_prior_draft_save(self, tmp_path):
        """Mask resolution reads the cached draft first: save a new password,
        then save again with the mask — the draft's ref is what survives."""
        manager = SourceManager(project_dir=str(tmp_path))
        manager.save_from_config(redshift_config(password="draft-pass"))

        source = manager.save_from_config(
            redshift_config(password=SECRET_MASK, host="other-host.example.com")
        )

        assert str(source.password) == "${env.WAREHOUSE_PASSWORD}"
        assert os.environ["WAREHOUSE_PASSWORD"] == "draft-pass"

    def test_masked_secret_with_no_stored_value_is_dropped(self, tmp_path):
        """A mask with nothing behind it (e.g. a config copied from another
        source's masked API response) must never be stored as a password."""
        manager = SourceManager(project_dir=str(tmp_path))

        source = manager.save_from_config(redshift_config(password=SECRET_MASK))

        assert source.password is None
        assert "password" not in commit_serialization(source)
        assert not (tmp_path / ".env").exists()

    def test_workspace_roundtrip_of_api_config_destroys_nothing(self, tmp_path):
        """The full bug scenario from the audit: GET a source through the API
        serialization (masked password), POST that config back with an
        unrelated edit, commit-serialize — the credential survives and the
        mask never appears."""
        manager = SourceManager(project_dir=str(tmp_path))
        published = RedshiftSourceFactory(name="warehouse", password="hunter2")
        manager._published_objects["warehouse"] = published

        api_config = manager.get_source_with_status("warehouse")["config"]
        assert api_config["password"] == SECRET_MASK  # what the frontend holds

        api_config["host"] = "moved.example.com"
        manager.save_from_config(api_config)

        dumped = commit_serialization(manager.cached_objects["warehouse"])
        assert dumped["host"] == "moved.example.com"
        assert dumped["password"] == "${env.WAREHOUSE_PASSWORD}"
        assert SECRET_MASK not in str(dumped)
        assert os.environ["WAREHOUSE_PASSWORD"] == "hunter2"


class TestNonSecretFieldsUnaffected:
    def test_non_secret_fields_update_normally(self, tmp_path):
        manager = SourceManager(project_dir=str(tmp_path))
        published = RedshiftSourceFactory(name="warehouse", password="${env.PW}")
        manager._published_objects["warehouse"] = published

        source = manager.save_from_config(
            redshift_config(
                password=SECRET_MASK,
                username="new_user",
                host="new-host.example.com",
                database="new_db",
            )
        )

        dumped = commit_serialization(source)
        assert dumped["username"] == "new_user"
        assert dumped["host"] == "new-host.example.com"
        assert dumped["database"] == "new_db"
        assert dumped["password"] == "${env.PW}"

    def test_sources_without_secret_fields_save_unchanged(self, tmp_path):
        manager = SourceManager(project_dir=str(tmp_path))

        source = manager.save_from_config(
            {"name": "local", "type": "sqlite", "database": "data/local.db"}
        )

        assert commit_serialization(source)["database"] == "data/local.db"
        assert not (tmp_path / ".env").exists()

    def test_env_var_ref_posted_directly_is_kept_verbatim(self, tmp_path):
        """A user typing ${env.X} into the form is already externalized —
        nothing to do, nothing written."""
        manager = SourceManager(project_dir=str(tmp_path))

        source = manager.save_from_config(redshift_config(password="${env.EXISTING_VAR}"))

        assert isinstance(source.password, EnvVarString)
        assert str(source.password) == "${env.EXISTING_VAR}"
        assert not (tmp_path / ".env").exists()


class TestEmptySecrets:
    def test_empty_password_is_dropped(self, tmp_path):
        manager = SourceManager(project_dir=str(tmp_path))

        source = manager.save_from_config(redshift_config(password=""))

        assert source.password is None
        assert "password" not in commit_serialization(source)
        assert not (tmp_path / ".env").exists()


class TestOtherSecretSourceFactories:
    def test_snowflake_and_bigquery_factories_mask_like_the_api(self):
        """Guard the sentinel across the other secret-bearing source types."""
        snow = SnowflakeSourceFactory(password="s3cret", private_key_passphrase="pk-pass")
        bq = BigQuerySourceFactory(credentials_base64="Y3JlZHM=")

        assert snow.model_dump(mode="json")["password"] == SECRET_MASK
        assert snow.model_dump(mode="json")["private_key_passphrase"] == SECRET_MASK
        assert bq.model_dump(mode="json")["credentials_base64"] == SECRET_MASK
