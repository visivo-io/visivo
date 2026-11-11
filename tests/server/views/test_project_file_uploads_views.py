"""Upload and import routes (VIS-1762). Contract: docs/contracts/project-files-and-credentials.md"""

import hashlib
import os
import time
from unittest.mock import Mock

import pytest
from flask import Flask

from visivo.server.managers.source_manager import SourceManager
from visivo.server.managers.source_op_job_manager import SourceOpJobManager
from visivo.server.views.project_files_views import register_project_files_views

CSV = b"region,units\nWest,12\nEast,7\nNorth,3\n"


@pytest.fixture
def flask_app(tmp_path):
    app = Mock()
    app._working_dir = str(tmp_path)
    app.source_manager = SourceManager(project_dir=str(tmp_path))
    return app


@pytest.fixture
def client(flask_app):
    app = Flask(__name__)
    register_project_files_views(app, flask_app, "/tmp/output")
    return app.test_client()


def upload(client, filename="Sales Q3.csv", content=CSV, **extra):
    created = client.post(
        "/api/project-files/uploads/",
        json={"filename": filename, "size": len(content), **extra},
    )
    assert created.status_code == 201, created.get_json()
    body = created.get_json()
    assert client.put(body["transfer"]["url"], data=content).status_code == 204
    completed = client.post(f"/api/project-files/uploads/{body['upload_id']}/complete/")
    assert completed.status_code == 200, completed.get_json()
    return completed.get_json()["file"]


def start_upload(client, filename="sales.csv", size=len(CSV), **extra):
    return client.post(
        "/api/project-files/uploads/", json={"filename": filename, "size": size, **extra}
    )


def wait(client, job_id):
    for _ in range(200):
        job = client.get(f"/api/project-file-imports/{job_id}/").get_json()
        if job["status"] in ("completed", "failed", "cancelled"):
            return job
        time.sleep(0.01)
    raise AssertionError("job did not finish")


def run_import(client, **body):
    response = client.post("/api/project-file-imports/", json={"action": "import", **body})
    assert response.status_code == 202, response.get_json()
    return wait(client, response.get_json()["job_id"])


def test_an_upload_lands_byte_for_byte_in_files_and_is_listed_with_its_version(client, tmp_path):
    file = upload(client, sha256=hashlib.sha256(CSV).hexdigest())

    assert (tmp_path / "files" / "Sales_Q3.csv").read_bytes() == CSV
    assert file["path"] == "files/Sales_Q3.csv"
    assert file["filename"] == "Sales_Q3.csv"
    assert file["original_filename"] == "Sales Q3.csv"
    assert file["version_id"].startswith("fv_")
    assert file["format"] == "csv"
    assert file["size"] == len(CSV)
    assert file["sha256"] == hashlib.sha256(CSV).hexdigest()

    listing = client.get("/api/project-files/").get_json()
    assert listing["files"] == [file]
    assert listing["formats"][0]["extensions"] == [".csv", ".tsv"]


def test_create_answers_the_reserved_path_and_a_local_put_transfer(client):
    body = start_upload(client, content_type="text/csv").get_json()

    assert body["upload_id"].startswith("up_")
    assert body["version_id"].startswith("fv_")
    assert body["path"] == "files/sales.csv"
    assert body["expires_at"].endswith("Z")
    assert body["transfer"] == {
        "method": "PUT",
        "url": f"/api/project-files/uploads/{body['upload_id']}/content/",
        "headers": {"Content-Type": "text/csv"},
    }


def test_a_second_upload_of_the_same_name_never_overwrites_the_first(client, tmp_path):
    first = upload(client, "sales.csv", CSV)
    second = upload(client, "sales.csv", b"region\nSouth\n")

    assert first["path"] == "files/sales.csv"
    assert second["path"] == "files/sales-2.csv"
    assert (tmp_path / "files" / "sales.csv").read_bytes() == CSV
    assert (tmp_path / "files" / "sales-2.csv").read_bytes() == b"region\nSouth\n"


def test_open_uploads_reserve_their_paths(client):
    a = start_upload(client).get_json()
    b = start_upload(client).get_json()

    assert (a["path"], b["path"]) == ("files/sales.csv", "files/sales-2.csv")


def test_a_hand_copied_file_at_the_reserved_path_moves_the_upload_aside(client, tmp_path):
    body = start_upload(client).get_json()
    (tmp_path / "files").mkdir()
    (tmp_path / "files" / "sales.csv").write_bytes(b"mine")
    client.put(body["transfer"]["url"], data=CSV)

    file = client.post(f"/api/project-files/uploads/{body['upload_id']}/complete/").get_json()[
        "file"
    ]

    assert file["path"] == "files/sales-2.csv"
    assert (tmp_path / "files" / "sales.csv").read_bytes() == b"mine"


def test_complete_is_repeatable(client):
    body = start_upload(client).get_json()
    client.put(body["transfer"]["url"], data=CSV)
    complete = f"/api/project-files/uploads/{body['upload_id']}/complete/"

    assert client.post(complete).get_json() == client.post(complete).get_json()


@pytest.mark.parametrize(
    "filename,expected",
    [
        ("../../etc/Evil Name.CSV", "files/Evil_Name.csv"),
        ("..\\..\\x.csv", "files/x.csv"),
        (".hidden.csv", "files/hidden.csv"),
        ("ünïcode.tsv", "files/_n_code.tsv"),
    ],
)
def test_filenames_are_sanitized_into_files(client, filename, expected):
    assert start_upload(client, filename).get_json()["path"] == expected


@pytest.mark.parametrize(
    "body",
    [
        None,
        {"size": 3},
        {"filename": "a.csv"},
        {"filename": "a.csv", "size": -1},
        {"filename": "a.csv", "size": True},
        {"filename": "a.csv", "size": 3, "sha256": "nope"},
    ],
)
def test_a_malformed_create_is_an_invalid_request(client, body):
    response = client.post("/api/project-files/uploads/", json=body)

    assert response.status_code == 400
    assert response.get_json()["code"] == "invalid_request"


def test_an_unlisted_extension_is_unsupported(client):
    response = start_upload(client, "budget.xlsx")

    assert response.status_code == 400
    assert response.get_json()["code"] == "unsupported_format"


def test_a_declared_size_over_100_mb_is_too_large(client):
    response = start_upload(client, size=100 * 1024 * 1024 + 1)

    assert response.status_code == 413
    assert response.get_json()["code"] == "too_large"


def test_received_bytes_over_the_limit_are_too_large(client, mocker, tmp_path):
    mocker.patch("visivo.server.project_file_uploads.MAX_BYTES", 10)
    body = start_upload(client, size=5).get_json()

    response = client.put(body["transfer"]["url"], data=b"x" * 11)

    assert response.status_code == 413
    assert response.get_json()["code"] == "too_large"
    assert not (tmp_path / "files").exists()


def test_complete_checks_content_size_and_checksum(client, tmp_path):
    body = start_upload(client, sha256=hashlib.sha256(CSV).hexdigest()).get_json()
    complete = f"/api/project-files/uploads/{body['upload_id']}/complete/"

    missing = client.post(complete)
    assert (missing.status_code, missing.get_json()["code"]) == (409, "content_missing")

    client.put(body["transfer"]["url"], data=CSV[:-1])
    short = client.post(complete)
    assert (short.status_code, short.get_json()["code"]) == (422, "size_mismatch")

    client.put(body["transfer"]["url"], data=CSV.upper())
    wrong = client.post(complete)
    assert (wrong.status_code, wrong.get_json()["code"]) == (422, "checksum_mismatch")
    assert not (tmp_path / "files" / "sales.csv").exists()

    client.put(body["transfer"]["url"], data=CSV)
    assert client.post(complete).status_code == 200


def test_content_after_complete_is_upload_closed(client):
    body = start_upload(client).get_json()
    client.put(body["transfer"]["url"], data=CSV)
    client.post(f"/api/project-files/uploads/{body['upload_id']}/complete/")

    response = client.put(body["transfer"]["url"], data=CSV)

    assert (response.status_code, response.get_json()["code"]) == (409, "upload_closed")


def test_an_expired_upload_is_closed_and_frees_its_path(client, mocker):
    body = start_upload(client).get_json()
    mocker.patch(
        "visivo.server.project_file_uploads._Upload.expired",
        new_callable=mocker.PropertyMock,
        return_value=True,
    )

    response = client.put(body["transfer"]["url"], data=CSV)

    assert (response.status_code, response.get_json()["code"]) == (409, "upload_closed")


@pytest.mark.parametrize(
    "method,path",
    [
        ("put", "/api/project-files/uploads/up_unknown/content/"),
        ("post", "/api/project-files/uploads/up_unknown/complete/"),
        ("get", "/api/project-file-imports/unknown/"),
    ],
)
def test_unknown_ids_are_not_found(client, method, path):
    response = getattr(client, method)(path, data=b"x")

    assert (response.status_code, response.get_json()["code"]) == (404, "not_found")


def test_a_files_folder_that_points_outside_the_project_is_refused(client, tmp_path):
    outside = tmp_path.parent / f"{tmp_path.name}-outside"
    outside.mkdir()
    (tmp_path / "files").symlink_to(outside)

    response = start_upload(client)

    assert response.status_code == 400
    assert response.get_json()["code"] == "invalid_request"


def test_import_adds_a_draft_csv_source_and_answers_a_preview(client, flask_app):
    file = upload(client, "sales.csv")

    job = run_import(client, path=file["path"], version_id=file["version_id"], source_name="sales")

    assert job["status"] == "completed", job
    assert job["kind"] == "file_import"
    result = job["result"]
    assert result["file"] == file
    assert result["source"]["name"] == "sales"
    assert result["source"]["status"] == "new"
    assert result["source"]["config"]["type"] == "csv"
    assert result["source"]["config"]["file"] == "files/sales.csv"
    assert result["tables"] == [
        {
            "name": "sales",
            "columns": [
                {"name": "region", "type": "VARCHAR"},
                {"name": "units", "type": "BIGINT"},
            ],
            "rows": [["West", 12], ["East", 7], ["North", 3]],
            "row_count": 3,
        }
    ]
    assert flask_app.source_manager.get("sales").file == "files/sales.csv"


def test_repeating_an_import_reuses_the_source(client, flask_app, mocker):
    file = upload(client, "sales.csv")
    run_import(client, path=file["path"], source_name="sales")
    save = mocker.spy(flask_app.source_manager, "save_from_config")

    job = run_import(client, path=file["path"], source_name="sales")

    assert job["status"] == "completed"
    assert job["result"]["source"]["name"] == "sales"
    save.assert_not_called()


def test_an_import_onto_another_sources_name_is_source_exists(client):
    first = upload(client, "sales.csv")
    second = upload(client, "sales.csv", b"region\nSouth\n")
    run_import(client, path=first["path"], source_name="sales")

    response = client.post(
        "/api/project-file-imports/",
        json={"action": "import", "path": second["path"], "source_name": "sales"},
    )

    assert (response.status_code, response.get_json()["code"]) == (409, "source_exists")


def test_inspect_previews_without_creating_anything(client, flask_app, tmp_path):
    (tmp_path / "data").mkdir()
    (tmp_path / "data" / "rates.tsv").write_bytes(b"code\trate\nA\t1.5\n")

    response = client.post(
        "/api/project-file-imports/", json={"action": "inspect", "path": "data/rates.tsv"}
    )
    job = wait(client, response.get_json()["job_id"])

    assert job["kind"] == "file_inspect"
    assert job["result"]["file"]["version_id"] is None
    assert job["result"]["tables"][0]["columns"] == [
        {"name": "code", "type": "VARCHAR"},
        {"name": "rate", "type": "DOUBLE"},
    ]
    assert flask_app.source_manager.get_sources_list() == []


def test_reader_options_apply(client, tmp_path):
    (tmp_path / "raw.csv").write_bytes(b"West;12\nEast;7\n")

    response = client.post(
        "/api/project-file-imports/",
        json={
            "action": "inspect",
            "path": "raw.csv",
            "options": {"header": False, "delimiter": ";", "table": "ignored"},
        },
    )
    table = wait(client, response.get_json()["job_id"])["result"]["tables"][0]

    assert table["rows"] == [["West", 12], ["East", 7]]


def test_a_failed_import_adds_no_source_and_keeps_the_file(client, flask_app, tmp_path, mocker):
    file = upload(client, "sales.csv")
    mocker.patch(
        "visivo.server.views.project_files_views.preview_csv",
        side_effect=ValueError("bad row 3"),
    )

    job = run_import(client, path=file["path"], source_name="sales")

    assert job["status"] == "failed"
    assert job["error"] == "Could not read files/sales.csv: bad row 3"
    assert flask_app.source_manager.get("sales") is None
    assert (tmp_path / "files" / "sales.csv").read_bytes() == CSV


@pytest.mark.parametrize(
    "body,status,code",
    [
        ({"path": "files/a.csv"}, 400, "invalid_request"),
        ({"action": "delete", "path": "files/a.csv"}, 400, "invalid_request"),
        ({"action": "inspect", "path": "/etc/passwd"}, 400, "invalid_request"),
        ({"action": "inspect", "path": "files/../../x.csv"}, 400, "invalid_request"),
        ({"action": "inspect", "path": "files/missing.csv"}, 404, "not_found"),
        ({"action": "inspect", "path": "files/a.csv", "version_id": "fv_x"}, 404, "not_found"),
        ({"action": "inspect", "path": "files/a.txt"}, 400, "unsupported_format"),
        (
            {"action": "inspect", "path": "files/a.csv", "options": {"header": "yes"}},
            400,
            "invalid_request",
        ),
        (
            {"action": "inspect", "path": "files/a.csv", "options": {"delimiter": ";;"}},
            400,
            "invalid_request",
        ),
        (
            {"action": "inspect", "path": "files/a.csv", "options": {"encoding": "ebcdic"}},
            400,
            "invalid_request",
        ),
        ({"action": "import", "path": "files/a.csv"}, 400, "invalid_request"),
    ],
)
def test_bad_import_requests(client, tmp_path, body, status, code):
    (tmp_path / "files").mkdir()
    (tmp_path / "files" / "a.csv").write_bytes(CSV)
    (tmp_path / "files" / "a.txt").write_bytes(CSV)

    response = client.post("/api/project-file-imports/", json=body)

    assert (response.status_code, response.get_json()["code"]) == (status, code)


def test_an_import_through_a_symlink_out_of_the_project_is_not_found(client, tmp_path):
    outside = tmp_path.parent / f"{tmp_path.name}-secret.csv"
    outside.write_bytes(CSV)
    (tmp_path / "link.csv").symlink_to(outside)

    response = client.post(
        "/api/project-file-imports/", json={"action": "inspect", "path": "link.csv"}
    )

    assert (response.status_code, response.get_json()["code"]) == (404, "not_found")


def test_another_kind_of_job_is_not_an_import(client):
    job_id = SourceOpJobManager.instance().start("test_connection", lambda: {})

    response = client.get(f"/api/project-file-imports/{job_id}/")

    assert response.status_code == 404
