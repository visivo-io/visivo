"""Tests for /api/files/<hash>/<run_id>/ — covers the B16 hash-of-stem fallback.

B16: post-1.0.82 the parquet writer started naming files with the model's
clean name (e.g. `metrics_table.parquet`) instead of `<alpha_hash>.parquet`.
The frontend still computes `alpha_hash(model_name)` client-side, so every
table data fetch hits a 404 unless the route falls back to scanning the dir
and matching by `alpha_hash(stem)`.
"""

import os
import shutil
import tempfile

import pytest
from flask import Flask

from visivo.models.base.named_model import alpha_hash
from visivo.server.views.file_views import register_file_views


# Smallest possible parquet payload: real PAR1 magic bytes + footer. We don't
# care about the parquet contents in these tests — only that send_file streams
# the file we expect — so a stub byte string with the magic header is fine for
# asserting "the right file was served."
def _write_stub_parquet(path, payload=b"PAR1stub-payload-PAR1"):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(payload)


@pytest.fixture
def output_dir():
    tmp = tempfile.mkdtemp()
    yield tmp
    shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture
def client(output_dir):
    app = Flask(__name__)
    register_file_views(app, output_dir)
    return app.test_client()


def _put_parquet(output_dir, run_id, stem, payload=b"PAR1content"):
    path = os.path.join(output_dir, run_id, "files", f"{stem}.parquet")
    _write_stub_parquet(path, payload)
    return path


# ---------- B16 regression: clean-name parquet served by alpha_hash(stem) ----------


def test_clean_named_parquet_served_via_alpha_hash_route(client, output_dir):
    """The bug: parquet on disk is `tiny_metrics.parquet`, frontend asks for
    `/api/files/<alpha_hash('tiny_metrics')>/main/`. Route must resolve."""
    model_name = "tiny_metrics"
    payload = b"PAR1tiny_metrics_payload"
    _put_parquet(output_dir, "main", model_name, payload=payload)

    response = client.get(f"/api/files/{alpha_hash(model_name)}/main/")

    assert response.status_code == 200
    assert response.data == payload


def test_clean_named_parquet_with_hyphens_and_dots(client, output_dir):
    """Model names with hyphens and dots (legal stem chars) still resolve."""
    model_name = "current-deal-status-by-open-month"
    _put_parquet(output_dir, "main", model_name)

    response = client.get(f"/api/files/{alpha_hash(model_name)}/main/")

    assert response.status_code == 200
    assert response.data.startswith(b"PAR1")


def test_legacy_hash_named_parquet_still_served(client, output_dir):
    """Pre-1.0.82 layout: parquet on disk is `<hash>.parquet`. Direct match
    must still win over the fallback so existing target/ dirs keep working
    when a project upgrades without `rm -rf target/`."""
    model_name = "legacy_model"
    name_hash = alpha_hash(model_name)
    payload = b"PAR1legacy_hash_named"
    _put_parquet(output_dir, "main", name_hash, payload=payload)

    response = client.get(f"/api/files/{name_hash}/main/")

    assert response.status_code == 200
    assert response.data == payload


def test_mixed_hash_and_clean_names_in_same_run(client, output_dir):
    """A target/ dir with both legacy hash-named and new clean-named parquets
    serves both correctly through the same route."""
    legacy_model = "legacy_model"
    new_model = "new_model"
    legacy_payload = b"PAR1legacy"
    new_payload = b"PAR1clean"

    _put_parquet(output_dir, "main", alpha_hash(legacy_model), payload=legacy_payload)
    _put_parquet(output_dir, "main", new_model, payload=new_payload)

    legacy_resp = client.get(f"/api/files/{alpha_hash(legacy_model)}/main/")
    new_resp = client.get(f"/api/files/{alpha_hash(new_model)}/main/")

    assert legacy_resp.status_code == 200
    assert legacy_resp.data == legacy_payload
    assert new_resp.status_code == 200
    assert new_resp.data == new_payload


def test_404_when_no_parquet_for_hash(client, output_dir):
    """Hash that doesn't correspond to anything on disk still 404s."""
    _put_parquet(output_dir, "main", "real_model")
    bogus_hash = alpha_hash("does_not_exist")

    response = client.get(f"/api/files/{bogus_hash}/main/")

    assert response.status_code == 404


def test_404_when_run_dir_missing(client, output_dir):
    """A run_id that doesn't exist yet 404s cleanly (no listdir error)."""
    response = client.get(f"/api/files/{alpha_hash('anything')}/run-that-doesnt-exist/")

    assert response.status_code == 404


def test_default_route_serves_main_run(client, output_dir):
    """The shorthand `/api/files/<hash>/` route uses run_id=main."""
    _put_parquet(output_dir, "main", "default_model", payload=b"PAR1default")

    response = client.get(f"/api/files/{alpha_hash('default_model')}/")

    assert response.status_code == 200
    assert response.data == b"PAR1default"


# ---------- Cache freshness: a parquet written after the first request is
# picked up on the next request without a server restart ----------


def test_cache_refreshes_on_miss_when_new_parquet_appears(client, output_dir):
    """First request 404s (no file). After we write the parquet, the next
    request must succeed — the cache rebuilds on miss."""
    model_name = "appears_later"
    name_hash = alpha_hash(model_name)

    first = client.get(f"/api/files/{name_hash}/main/")
    assert first.status_code == 404

    _put_parquet(output_dir, "main", model_name, payload=b"PAR1now-here")

    second = client.get(f"/api/files/{name_hash}/main/")
    assert second.status_code == 200
    assert second.data == b"PAR1now-here"


def test_cache_keyed_per_run_id(client, output_dir):
    """Parquets in different runs don't bleed into each other's lookups."""
    model_name = "shared_name"
    name_hash = alpha_hash(model_name)

    _put_parquet(output_dir, "run-a", model_name, payload=b"PAR1from-a")
    _put_parquet(output_dir, "run-b", model_name, payload=b"PAR1from-b")

    a = client.get(f"/api/files/{name_hash}/run-a/")
    b = client.get(f"/api/files/{name_hash}/run-b/")

    assert a.status_code == 200
    assert a.data == b"PAR1from-a"
    assert b.status_code == 200
    assert b.data == b"PAR1from-b"
