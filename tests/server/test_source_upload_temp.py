"""Tests for POST /api/source/upload-temp/ endpoint.

This endpoint saves an uploaded file (SQLite, DuckDB, CSV, Excel) to the
project's data/ directory and returns its absolute path so the form can
auto-fill the database/path field.
"""

import io
import os
import json

import pytest


# Minimal valid SQLite header for fixture content (16-byte SQLite signature).
SQLITE_HEADER = b"SQLite format 3\x00"


def _post_upload_temp(client, content, filename, project_dir):
    """Helper to POST a file to the upload-temp endpoint."""
    return client.post(
        "/api/source/upload-temp/",
        data={"file": (io.BytesIO(content), filename), "project_dir": project_dir,},
        content_type="multipart/form-data",
    )


def test_upload_temp_saves_sqlite_and_returns_path(integration_client, tmp_path):
    """Uploading a SQLite file saves it under <project_dir>/data/ and returns abs path."""
    content = SQLITE_HEADER + b"\x00" * 16
    response = _post_upload_temp(integration_client, content, "mydb.db", str(tmp_path))

    assert response.status_code == 200
    payload = response.get_json()
    expected_path = os.path.join(str(tmp_path), "data", "mydb.db")
    assert payload["absolute_path"] == expected_path
    assert payload["filename"] == "mydb.db"
    assert payload["size_bytes"] == len(content)
    assert os.path.exists(expected_path)


def test_upload_temp_saves_csv_and_returns_path(integration_client, tmp_path):
    """Uploading a CSV file saves and returns abs path."""
    content = b"col1,col2\n1,2\n3,4\n"
    response = _post_upload_temp(integration_client, content, "data.csv", str(tmp_path))

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["absolute_path"].endswith(os.path.join("data", "data.csv"))
    assert payload["filename"] == "data.csv"
    assert payload["size_bytes"] == len(content)
    assert os.path.exists(payload["absolute_path"])
    with open(payload["absolute_path"], "rb") as f:
        assert f.read() == content


def test_upload_temp_sanitizes_filename(integration_client, tmp_path):
    """Filenames with spaces/special chars are sanitized to safe characters."""
    content = b"x"
    response = _post_upload_temp(
        integration_client, content, "weird name with spaces & chars!.db", str(tmp_path)
    )

    assert response.status_code == 200
    payload = response.get_json()
    # Spaces, ampersands, exclamation marks should all be replaced with underscores.
    assert " " not in payload["filename"]
    assert "&" not in payload["filename"]
    assert "!" not in payload["filename"]
    # Dots and dashes should be preserved.
    assert payload["filename"].endswith(".db")
    assert os.path.exists(payload["absolute_path"])


def test_upload_temp_creates_data_dir_if_missing(integration_client, tmp_path):
    """The data/ subdirectory is auto-created if it does not exist."""
    data_dir = os.path.join(str(tmp_path), "data")
    assert not os.path.exists(data_dir)

    content = b"ok"
    response = _post_upload_temp(integration_client, content, "x.db", str(tmp_path))

    assert response.status_code == 200
    assert os.path.isdir(data_dir)


def test_upload_temp_400_when_no_file(integration_client, tmp_path):
    """Returns 400 when the request has no file part."""
    response = integration_client.post(
        "/api/source/upload-temp/",
        data={"project_dir": str(tmp_path)},
        content_type="multipart/form-data",
    )

    assert response.status_code == 400
    payload = response.get_json()
    assert "error" in payload


def test_upload_temp_400_when_empty_filename(integration_client, tmp_path):
    """Returns 400 when the file has no filename."""
    response = integration_client.post(
        "/api/source/upload-temp/",
        data={"file": (io.BytesIO(b"x"), ""), "project_dir": str(tmp_path),},
        content_type="multipart/form-data",
    )

    assert response.status_code == 400


def test_upload_temp_uses_cwd_when_project_dir_missing(integration_client, tmp_path, monkeypatch):
    """Falls back to os.getcwd() when project_dir is not supplied."""
    monkeypatch.chdir(tmp_path)
    content = b"y"
    response = integration_client.post(
        "/api/source/upload-temp/",
        data={"file": (io.BytesIO(content), "fallback.db")},
        content_type="multipart/form-data",
    )

    assert response.status_code == 200
    payload = response.get_json()
    # cwd may resolve through symlinks (e.g. /private/var/...) so compare via realpath.
    assert os.path.realpath(payload["absolute_path"]) == os.path.realpath(
        os.path.join(str(tmp_path), "data", "fallback.db")
    )
