"""POST /api/source-credentials/ (VIS-1764). Contract: docs/contracts/project-files-and-credentials.md"""

import os
from unittest.mock import Mock

import pytest
from dotenv import dotenv_values
from flask import Flask

from visivo.logger.logger import Logger
from visivo.server.managers.source_manager import SourceManager
from visivo.server.views.sources_views import register_source_views

CONFIG = {
    "name": "warehouse",
    "type": "postgresql",
    "host": "db.example.com",
    "database": "analytics",
    "username": "analyst",
    "password": "typed value",
}


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
    flask_app.source_manager = SourceManager(project_dir=str(tmp_path))
    register_source_views(app, flask_app, "/tmp/output")
    return app.test_client()


def test_answers_the_referencing_config_and_what_was_stored(client, tmp_path):
    response = client.post("/api/source-credentials/", json={"source": CONFIG})

    assert response.status_code == 200
    assert response.get_json() == {
        "source": {**CONFIG, "password": "${env.WAREHOUSE_PASSWORD}"},
        "credentials": [
            {
                "field": "password",
                "reference": "${env.WAREHOUSE_PASSWORD}",
                "storage": "project_env",
                "created": True,
            }
        ],
    }
    assert "typed value" not in response.get_data(as_text=True)
    assert dotenv_values(str(tmp_path / ".env")) == {"WAREHOUSE_PASSWORD": "typed value"}


@pytest.mark.parametrize("body", [None, {}, {"source": "warehouse"}, {"source": {"type": "x"}}])
def test_a_missing_source_or_name_is_an_invalid_request(client, body):
    response = client.post("/api/source-credentials/", json=body)

    assert response.status_code == 400
    assert response.get_json()["code"] == "invalid_request"


def test_a_config_that_fails_validation_is_an_invalid_request(client, tmp_path):
    response = client.post(
        "/api/source-credentials/", json={"source": {**CONFIG, "type": "not-a-source"}}
    )

    assert response.status_code == 400
    assert response.get_json()["code"] == "invalid_request"
    assert response.get_json()["error"].startswith("Invalid source configuration")
    assert "typed value" not in response.get_data(as_text=True)
    assert not (tmp_path / ".env").exists()


def test_a_write_failure_is_storage_failed_without_the_secret(client, mocker):
    mocker.patch(
        "visivo.server.managers.source_manager.merge_env_file",
        side_effect=PermissionError(13, "Permission denied"),
    )
    error = mocker.patch.object(Logger.instance(), "error")

    response = client.post("/api/source-credentials/", json={"source": CONFIG})

    assert response.status_code == 500
    assert response.get_json() == {
        "error": "Could not save the credentials to the project's .env file.",
        "code": "storage_failed",
    }
    assert "typed value" not in str(error.call_args_list)
