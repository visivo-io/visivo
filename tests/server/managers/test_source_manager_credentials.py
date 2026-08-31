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
from dotenv import dotenv_values
from pydantic import SecretStr

from tests.factories.model_factories import (
    BigQuerySourceFactory,
    RedshiftSourceFactory,
    SnowflakeSourceFactory,
)
from visivo.logger.logger import Logger
from visivo.models.base.env_var_string import EnvVarString
from visivo.models.project import Project
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


def read_env(tmp_path):
    """The .env parsed exactly as python-dotenv will parse it on the next run.

    Never a hand-rolled ``split("=")``: values are quoted and escaped on write,
    and the only assertion worth making is on the string a restart loads back.
    """
    return dict(dotenv_values(str(tmp_path / ".env")))


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
        assert read_env(tmp_path)["WAREHOUSE_PASSWORD"] == "hunter2"
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
        env_values = read_env(tmp_path)
        assert env_values["SNOW_PASSWORD"] == "snowpass"
        assert env_values["SNOW_PRIVATE_KEY_PASSPHRASE"] == "passphrase-secret"
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
        assert read_env(tmp_path)["BQ_CREDENTIALS_BASE64"] == "c2VydmljZS1hY2NvdW50LWpzb24="
        assert "c2VydmljZS1hY2NvdW50LWpzb24=" not in str(commit_serialization(source))

    def test_changed_plaintext_secret_updates_env_value(self, tmp_path):
        manager = SourceManager(project_dir=str(tmp_path))
        manager.save_from_config(redshift_config())
        assert os.environ["WAREHOUSE_PASSWORD"] == "hunter2"

        source = manager.save_from_config(redshift_config(password="rotated-pass"))

        assert str(source.password) == "${env.WAREHOUSE_PASSWORD}"
        env_content = (tmp_path / ".env").read_text()
        assert read_env(tmp_path)["WAREHOUSE_PASSWORD"] == "rotated-pass"
        assert "hunter2" not in env_content
        assert os.environ["WAREHOUSE_PASSWORD"] == "rotated-pass"

    def test_env_file_merge_preserves_unrelated_entries(self, tmp_path):
        (tmp_path / ".env").write_text("# my vars\nOTHER_API_KEY=abc123\n")
        manager = SourceManager(project_dir=str(tmp_path))

        manager.save_from_config(redshift_config())

        env_content = (tmp_path / ".env").read_text()
        assert "# my vars" in env_content  # the comment survives the merge
        env_values = read_env(tmp_path)
        assert env_values["OTHER_API_KEY"] == "abc123"
        assert env_values["WAREHOUSE_PASSWORD"] == "hunter2"


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
        assert read_env(tmp_path)["WAREHOUSE_PASSWORD"] == "hunter2"
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


class TestEnvFileEncoding:
    """A credential in .env must read back byte-identical on the next start.

    Writing ``KEY=<raw>`` is lossy: python-dotenv's unquoted parser strips
    trailing whitespace, truncates at ``#``, unwraps surrounding quotes and
    interpolates ``${...}``, and a value containing a newline corrupts the file
    outright. Because the YAML now holds only a ``${env.*}`` reference, the
    .env line is the *only* remaining copy of the password — anything dotenv
    mangles is unrecoverable.
    """

    @pytest.mark.parametrize(
        "secret",
        [
            "Passw0rd #1",  # dotenv truncates at the unquoted `#`
            "hunter2 ",  # trailing space stripped
            " hunter2",  # leading space stripped
            '"quoted"',  # surrounding quotes eaten
            "'quoted'",
            "p${a}ss",  # POSIX interpolation blanks the reference
            "${HOME}",
            "back\\slash",
            "it's a 'test'",
            "mix\"and'quote",
            "tab\there",
            "a=b=c",
            "#leading-hash",
            "pa$$word",
        ],
        ids=repr,
    )
    def test_awkward_password_round_trips_through_dotenv(self, tmp_path, secret):
        manager = SourceManager(project_dir=str(tmp_path))

        manager.save_from_config(redshift_config(password=secret))

        # What the next `visivo serve` will load — not what the bytes look like.
        assert read_env(tmp_path)["WAREHOUSE_PASSWORD"] == secret
        assert os.environ["WAREHOUSE_PASSWORD"] == secret

    def test_multi_line_credential_stays_a_single_env_entry(self, tmp_path):
        """`base64` wraps at 76 columns, so a pasted BigQuery service-account
        blob is multi-line. An unescaped newline used to split it into a bogus
        standalone line and truncate the credential to its first line."""
        blob = "eyJ0eXBlIjogInNlcnZpY2VfYWNjb3VudCIs\nImtleSI6ICItLS0tLUJFR0lOIn0=\n"
        (tmp_path / ".env").write_text("OTHER_API_KEY=abc123\n")
        manager = SourceManager(project_dir=str(tmp_path))

        manager.save_from_config(
            {
                "name": "bq",
                "type": "bigquery",
                "project": "test-project",
                "database": "test_dataset",
                "credentials_base64": blob,
            }
        )

        env_values = read_env(tmp_path)
        assert env_values["BQ_CREDENTIALS_BASE64"] == blob
        # The unrelated entry is still readable — the newline did not corrupt
        # the rest of the file.
        assert env_values["OTHER_API_KEY"] == "abc123"
        assert len(env_values) == 2

    def test_awkward_secret_survives_a_later_unrelated_merge(self, tmp_path):
        """A second save must re-parse, not mangle, the first quoted entry."""
        manager = SourceManager(project_dir=str(tmp_path))
        manager.save_from_config(redshift_config(password="Passw0rd #1"))

        manager.save_from_config(
            {"name": "snow", "type": "snowflake", "account": "a", "database": "d", "password": "b"}
        )

        env_values = read_env(tmp_path)
        assert env_values["WAREHOUSE_PASSWORD"] == "Passw0rd #1"
        assert env_values["SNOW_PASSWORD"] == "b"


class TestEnvVarNameIsResolvable:
    def test_source_name_starting_with_a_digit_still_resolves(self, tmp_path):
        """`2024_warehouse` is a legal source name but `2024_WAREHOUSE_PASSWORD`
        is not a legal env var name — ENV_VAR_CONTEXT_PATTERN rejects a leading
        digit, so the stored reference resolved to nothing and the source
        authenticated with the literal "${env....}" string."""
        manager = SourceManager(project_dir=str(tmp_path))

        source = manager.save_from_config(redshift_config(name="2024_warehouse"))

        assert isinstance(source.password, EnvVarString)
        # The reference actually resolves — this is the whole point.
        assert source.password.get_env_var_names() != []
        assert source.password.resolve() == "hunter2"
        assert source.get_password() == "hunter2"
        assert read_env(tmp_path)[source.password.get_env_var_names()[0]] == "hunter2"

    def test_non_ascii_source_name_still_resolves(self, tmp_path):
        manager = SourceManager(project_dir=str(tmp_path))

        source = manager.save_from_config(redshift_config(name="café"))

        assert source.password.resolve() == "hunter2"
        assert source.get_password() == "hunter2"

    def test_stored_reference_survives_a_yaml_round_trip(self, tmp_path):
        """The committed YAML is re-parsed on the next run through
        SecretStrOrEnvVarDiscriminator; a reference the pattern rejects would
        come back as a plain SecretStr literal, making the loss permanent."""
        manager = SourceManager(project_dir=str(tmp_path))
        source = manager.save_from_config(redshift_config(name="2024_warehouse"))

        reparsed = manager.validate_object(commit_serialization(source))

        assert isinstance(reparsed.password, EnvVarString)
        assert reparsed.get_password() == "hunter2"


class TestEnvVarNameCollisions:
    def test_similar_source_names_do_not_overwrite_each_others_credentials(self, tmp_path):
        """`analytics-db` and `analytics_db` both collapse to
        ANALYTICS_DB_PASSWORD; the second save used to silently replace the
        first source's credential with no way to recover it."""
        manager = SourceManager(project_dir=str(tmp_path))

        first = manager.save_from_config(redshift_config(name="analytics-db", password="passA"))
        second = manager.save_from_config(redshift_config(name="analytics_db", password="passB"))

        assert first.password.resolve() == "passA"
        assert second.password.resolve() == "passB"
        assert str(first.password) != str(second.password)
        assert sorted(read_env(tmp_path).values()) == ["passA", "passB"]

    def test_rotating_a_password_reuses_the_source_own_key(self, tmp_path):
        """Collision avoidance must not fire on the source's own key, or every
        rotation would leak a new WAREHOUSE_PASSWORD_2, _3, ... entry."""
        manager = SourceManager(project_dir=str(tmp_path))
        manager.save_from_config(redshift_config(password="first"))

        source = manager.save_from_config(redshift_config(password="second"))

        assert str(source.password) == "${env.WAREHOUSE_PASSWORD}"
        assert read_env(tmp_path) == {"WAREHOUSE_PASSWORD": "second"}


class TestStoredMaskLiteralIsNotACredential:
    def test_published_mask_literal_is_dropped_not_externalized(self, tmp_path):
        """The population this change targets: a project.visivo.yml already
        corrupted with `password: '**********'`. Externalizing that value would
        move the bogus literal into .env and leave the YAML reading like a
        correct env-var reference — hiding the only symptom the user could
        spot and retype."""
        manager = SourceManager(project_dir=str(tmp_path))
        manager._published_objects["warehouse"] = RedshiftSourceFactory(
            name="warehouse", password=SECRET_MASK
        )

        source = manager.save_from_config(redshift_config(password=SECRET_MASK, port=5440))

        assert source.password is None
        assert "password" not in commit_serialization(source)
        assert not (tmp_path / ".env").exists()

    def test_typing_the_mask_as_a_new_password_stores_nothing(self, tmp_path):
        manager = SourceManager(project_dir=str(tmp_path))

        source = manager.save_from_config(redshift_config(password=SECRET_MASK))

        assert source.password is None
        assert not (tmp_path / ".env").exists()


class TestDeletedSourceCredential:
    def test_masked_save_after_delete_recovers_the_published_credential(self, tmp_path):
        """Deleting a source tombstones it as None in the cache. `self.get()`
        then answers None, so a mask arriving from the still-open form used to
        drop a credential that was sitting untouched in _published_objects."""
        manager = SourceManager(project_dir=str(tmp_path))
        manager._published_objects["warehouse"] = RedshiftSourceFactory(
            name="warehouse", password="hunter2"
        )
        manager.mark_for_deletion("warehouse")
        assert manager.get("warehouse") is None  # the tombstone

        source = manager.save_from_config(redshift_config(password=SECRET_MASK))

        assert source.password is not None
        assert source.password.get_secret_value() == "hunter2"
        assert manager.get_status("warehouse") == ObjectStatus.PUBLISHED

    def test_masked_edit_after_delete_externalizes_the_published_credential(self, tmp_path):
        """Same recovery, but the re-save also edits a field, so the source is
        headed for a YAML rewrite and the credential must move to .env."""
        manager = SourceManager(project_dir=str(tmp_path))
        manager._published_objects["warehouse"] = RedshiftSourceFactory(
            name="warehouse", password="hunter2"
        )
        manager.mark_for_deletion("warehouse")

        source = manager.save_from_config(redshift_config(password=SECRET_MASK, port=5440))

        assert str(source.password) == "${env.WAREHOUSE_PASSWORD}"
        assert source.get_password() == "hunter2"
        assert read_env(tmp_path)["WAREHOUSE_PASSWORD"] == "hunter2"


class TestRenameShape:
    def test_masked_save_under_an_unknown_name_drops_the_secret_loudly(self, tmp_path, mocker):
        """`sources_views.save_source` forces the config name from the URL, so
        POSTing a masked body to /api/sources/<new-name>/ finds nothing stored
        under that name. The mask must never be stored — but the drop has to be
        announced, because the endpoint answers 201 either way."""
        warn = mocker.patch.object(Logger.instance(), "warn")
        manager = SourceManager(project_dir=str(tmp_path))
        manager._published_objects["warehouse"] = RedshiftSourceFactory(
            name="warehouse", password="hunter2"
        )

        source = manager.save_from_config(
            redshift_config(name="warehouse-renamed", password=SECRET_MASK)
        )

        assert source.password is None
        assert SECRET_MASK not in str(commit_serialization(source))
        assert warn.called
        assert "warehouse-renamed" in warn.call_args[0][0]


class TestGitignore:
    def test_env_is_added_to_an_existing_gitignore_before_the_first_write(self, tmp_path):
        """A plaintext credential must not land in a tracked file: `visivo init`
        only seeds `.env` into a .gitignore it creates itself, so a cloned or
        hand-written project's .gitignore never gains the entry."""
        (tmp_path / ".gitignore").write_text("target\n.visivo_cache\n")
        manager = SourceManager(project_dir=str(tmp_path))

        manager.save_from_config(redshift_config())

        lines = (tmp_path / ".gitignore").read_text().splitlines()
        assert ".env" in lines
        assert "target" in lines  # existing entries untouched
        assert lines.count(".env") == 1

    def test_gitignore_is_created_when_absent(self, tmp_path):
        manager = SourceManager(project_dir=str(tmp_path))

        manager.save_from_config(redshift_config())

        assert (tmp_path / ".gitignore").read_text().splitlines() == [".env"]

    def test_gitignore_without_trailing_newline_is_not_corrupted(self, tmp_path):
        (tmp_path / ".gitignore").write_text("target")
        manager = SourceManager(project_dir=str(tmp_path))

        manager.save_from_config(redshift_config())

        assert (tmp_path / ".gitignore").read_text().splitlines() == ["target", ".env"]

    def test_gitignore_untouched_when_nothing_is_externalized(self, tmp_path):
        manager = SourceManager(project_dir=str(tmp_path))

        manager.save_from_config({"name": "local", "type": "sqlite", "database": "local.db"})

        assert not (tmp_path / ".gitignore").exists()


class TestNoopSaveOfADagLoadedSource:
    """The published sources a running server holds come from the project DAG,
    where `Project.set_path_on_named_models` stamps `path` on each one and (in
    any project with includes) the parser stamps `file_path`. The API config
    strips both, so a round-tripped save can never carry them back — and
    comparing them made every masked no-op save look MODIFIED, rewriting the
    YAML and creating a .env for a save that changed nothing."""

    @staticmethod
    def _manager_with_dag_loaded_source(tmp_path):
        project = Project(
            name="p",
            sources=[
                {
                    "name": "warehouse",
                    "type": "redshift",
                    "host": "test-cluster.example.amazonaws.com",
                    "port": 5439,
                    "database": "test_db",
                    "username": "test_user",
                    "password": "hunter2",
                }
            ],
        )
        manager = SourceManager(project_dir=str(tmp_path))
        manager.load(project.dag())
        return manager

    def test_published_source_from_the_dag_carries_a_path(self, tmp_path):
        manager = self._manager_with_dag_loaded_source(tmp_path)

        assert manager.published_objects["warehouse"].path == "project.sources[0]"

    def test_masked_noop_save_of_a_dag_loaded_source_writes_nothing(self, tmp_path):
        manager = self._manager_with_dag_loaded_source(tmp_path)

        api_config = manager.get_source_with_status("warehouse")["config"]
        assert api_config["password"] == SECRET_MASK
        source = manager.save_from_config(api_config)

        assert isinstance(source.password, SecretStr)
        assert source.password.get_secret_value() == "hunter2"
        assert manager.get_status("warehouse") == ObjectStatus.PUBLISHED
        assert not (tmp_path / ".env").exists()

    def test_masked_noop_save_with_a_file_path_writes_nothing(self, tmp_path):
        """`file_path` is stamped on every named source as soon as a project
        uses includes — the multi-file case."""
        manager = self._manager_with_dag_loaded_source(tmp_path)
        manager.published_objects["warehouse"].file_path = "project.visivo.yml"

        api_config = manager.get_source_with_status("warehouse")["config"]
        source = manager.save_from_config(api_config)

        assert source.password.get_secret_value() == "hunter2"
        assert manager.get_status("warehouse") == ObjectStatus.PUBLISHED
        assert not (tmp_path / ".env").exists()

    def test_a_real_edit_of_a_dag_loaded_source_still_externalizes(self, tmp_path):
        """The guard must only cover no-ops — an actual change still has to
        move the credential out of the YAML a commit would rewrite."""
        manager = self._manager_with_dag_loaded_source(tmp_path)

        api_config = manager.get_source_with_status("warehouse")["config"]
        api_config["port"] = 5440
        source = manager.save_from_config(api_config)

        assert manager.get_status("warehouse") == ObjectStatus.MODIFIED
        assert str(source.password) == "${env.WAREHOUSE_PASSWORD}"
        assert read_env(tmp_path)["WAREHOUSE_PASSWORD"] == "hunter2"
