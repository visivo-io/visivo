"""POST /api/secrets/ (VIS-1764). Contract: docs/contracts/project-files-and-credentials.md"""

import os
from unittest.mock import Mock

import pytest
from dotenv import dotenv_values
from flask import Flask

from visivo.logger.logger import Logger
from visivo.server.views.secrets_views import register_secrets_views


@pytest.fixture(autouse=True)
def restore_environ():
    snapshot = dict(os.environ)
    yield
    os.environ.clear()
    os.environ.update(snapshot)


@pytest.fixture
def client(tmp_path):
    app = Flask(__name__)
    flask_app = Mock()
    flask_app._working_dir = str(tmp_path)
    register_secrets_views(app, flask_app, "/tmp/output")
    return app.test_client()


def test_a_secret_lands_in_the_gitignored_env_and_the_running_server(client, tmp_path):
    response = client.post("/api/secrets/", json={"key": "WH_PASSWORD", "value": "p${a}ss"})

    assert (response.status_code, response.get_json()) == (201, {"key": "WH_PASSWORD"})
    assert "p${a}ss" not in response.get_data(as_text=True)
    assert dotenv_values(str(tmp_path / ".env")) == {"WH_PASSWORD": "p${a}ss"}
    assert (tmp_path / ".gitignore").read_text() == ".env\n"
    assert os.environ["WH_PASSWORD"] == "p${a}ss"


def test_other_env_lines_are_kept(client, tmp_path):
    (tmp_path / ".env").write_text("# mine\nOTHER=1\n")

    client.post("/api/secrets/", json={"key": "WH_PASSWORD", "value": "x"})

    assert (tmp_path / ".env").read_text().startswith("# mine\nOTHER=1\n")


def test_an_existing_key_is_never_overwritten(client, tmp_path, monkeypatch):
    (tmp_path / ".env").write_text("WH_PASSWORD=old\n")
    monkeypatch.setenv("SHELL_ONLY", "shell")

    for key in ("WH_PASSWORD", "SHELL_ONLY"):
        response = client.post("/api/secrets/", json={"key": key, "value": "new"})
        assert response.status_code == 409
        assert response.get_json()["code"] == "already_exists"

    assert dotenv_values(str(tmp_path / ".env")) == {"WH_PASSWORD": "old"}
    assert os.environ["SHELL_ONLY"] == "shell"


@pytest.mark.parametrize(
    "body",
    [
        None,
        {"value": "x"},
        {"key": "2FAST", "value": "x"},
        {"key": "HAS-DASH", "value": "x"},
        {"key": "OK", "value": ""},
        {"key": "OK", "value": 3},
    ],
)
def test_a_bad_key_or_value_is_an_invalid_request(client, tmp_path, body):
    response = client.post("/api/secrets/", json=body)

    assert response.status_code == 400
    assert response.get_json()["code"] == "invalid_request"
    assert not (tmp_path / ".env").exists()


def test_a_write_failure_is_storage_failed_without_the_value(client, mocker):
    mocker.patch(
        "visivo.server.views.secrets_views.merge_env_file",
        side_effect=PermissionError(13, "Permission denied"),
    )
    error = mocker.patch.object(Logger.instance(), "error")

    response = client.post("/api/secrets/", json={"key": "WH_PASSWORD", "value": "typed value"})

    assert response.status_code == 500
    assert response.get_json()["code"] == "storage_failed"
    assert "typed value" not in str(error.call_args_list)
    assert "WH_PASSWORD" not in os.environ
