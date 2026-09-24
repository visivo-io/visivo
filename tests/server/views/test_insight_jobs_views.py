"""GET /api/insight-jobs/ — never-built must be a calm empty state, not a 404.

The old 404 doubled as the empty state, and the client treated any non-2xx as
transient: fetchInsightJobs retried 3x at 1s, React Query retried once more —
so ONE render of a not-yet-built insight produced up to six polls and six
"Insight file not found" log lines (M16 / field-test serve.log flood).
"""

import json
import os

import pytest
from flask import Flask

from visivo.server.views.insight_jobs_views import register_insight_jobs_views


@pytest.fixture
def client(tmp_path):
    app = Flask(__name__)
    app.config["TESTING"] = True
    register_insight_jobs_views(app, None, str(tmp_path))
    return app.test_client(), tmp_path


def _write_insight(output_dir, name, payload=None):
    insights_dir = os.path.join(str(output_dir), "main", "insights")
    os.makedirs(insights_dir, exist_ok=True)
    with open(os.path.join(insights_dir, f"{name}.json"), "w") as f:
        json.dump(payload or {"name": name, "files": []}, f)


def test_never_built_is_200_not_built_not_404(client):
    test_client, _ = client
    resp = test_client.get("/api/insight-jobs/?insight_names=never_built")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["state"] == "not_built"
    assert body["insights"] == []
    assert body["missing"] == ["never_built"]


def test_built_insights_keep_the_bare_array_contract(client):
    test_client, output_dir = client
    _write_insight(output_dir, "revenue")
    resp = test_client.get("/api/insight-jobs/?insight_names=revenue")
    assert resp.status_code == 200
    body = resp.get_json()
    assert isinstance(body, list)
    assert body[0]["id"] == "revenue"


def test_partial_missing_returns_the_found_insights_as_an_array(client):
    test_client, output_dir = client
    _write_insight(output_dir, "revenue")
    resp = test_client.get("/api/insight-jobs/?insight_names=revenue&insight_names=ghost")
    assert resp.status_code == 200
    body = resp.get_json()
    assert isinstance(body, list)
    assert [i["id"] for i in body] == ["revenue"]


def test_no_names_is_still_a_400(client):
    test_client, _ = client
    assert test_client.get("/api/insight-jobs/").status_code == 400
