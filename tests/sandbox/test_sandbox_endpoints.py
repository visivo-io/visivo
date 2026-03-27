#!/usr/bin/env python3
"""
Sandbox endpoint tests — hit a live visivo serve instance.

Usage:
    python tests/sandbox/test_sandbox_endpoints.py [--port PORT]

Expects visivo serve to be running at the given port (default: 8001).
This script is NOT run via pytest — it's a standalone test runner
for validating backend endpoints against a real server.
"""

import argparse
import sys
import json as _json

try:
    import httpx
except ImportError:
    import urllib.request
    import urllib.error

    class _MinimalClient:
        """Fallback if httpx is not installed."""

        def __init__(self, base_url):
            self.base_url = base_url

        def get(self, path):
            url = f"{self.base_url}{path}"
            try:
                req = urllib.request.Request(url)
                resp = urllib.request.urlopen(req, timeout=10)
                return _Response(resp.status, resp.read())
            except urllib.error.HTTPError as e:
                return _Response(e.code, e.read())
            except Exception as e:
                return _Response(0, str(e).encode())

        def post(self, path, *, json=None):
            url = f"{self.base_url}{path}"
            data = _json.dumps(json).encode() if json else None
            try:
                req = urllib.request.Request(
                    url, data=data, method="POST",
                    headers={"Content-Type": "application/json"} if data else {},
                )
                resp = urllib.request.urlopen(req, timeout=10)
                return _Response(resp.status, resp.read())
            except urllib.error.HTTPError as e:
                return _Response(e.code, e.read())
            except Exception as e:
                return _Response(0, str(e).encode())

        def delete(self, path):
            url = f"{self.base_url}{path}"
            try:
                req = urllib.request.Request(url, method="DELETE")
                resp = urllib.request.urlopen(req, timeout=10)
                return _Response(resp.status, resp.read())
            except urllib.error.HTTPError as e:
                return _Response(e.code, e.read())
            except Exception as e:
                return _Response(0, str(e).encode())

    class _Response:
        def __init__(self, status_code, content):
            self.status_code = status_code
            self._content = content

        def json(self):
            return _json.loads(self._content)

        @property
        def text(self):
            return self._content.decode("utf-8", errors="replace")

    httpx = None


def make_client(base_url):
    if httpx:
        return httpx.Client(base_url=base_url, timeout=10)
    return _MinimalClient(base_url)


def test_project_loads(client):
    r = client.get("/data/project.json")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"
    data = r.json()
    assert "name" in data or "dashboards" in data, "project.json missing expected keys"


def test_sources_list(client):
    r = client.get("/api/sources/")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"


def test_models_list(client):
    r = client.get("/api/models/")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"


def test_insights_list(client):
    r = client.get("/api/insights/")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"


def test_charts_list(client):
    r = client.get("/api/charts/")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"


def test_tables_list(client):
    r = client.get("/api/tables/")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"


def test_dashboards_list(client):
    r = client.get("/api/dashboards/")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"


def test_inputs_list(client):
    r = client.get("/api/inputs/")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"


def test_dimensions_list(client):
    r = client.get("/api/dimensions/")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"


def test_metrics_list(client):
    r = client.get("/api/metrics/")
    assert r.status_code == 200, f"Expected 200, got {r.status_code}"


def test_model_save_and_read(client):
    save_data = {"name": "_sandbox_test_model", "sql": "SELECT 1 AS x, 2 AS y"}
    r = client.post("/api/models/_sandbox_test_model/save/", json=save_data)
    assert r.status_code in (200, 201), f"Save failed: {r.status_code} {r.text}"

    r = client.get("/api/models/_sandbox_test_model/")
    assert r.status_code == 200, f"Read failed: {r.status_code}"

    r = client.delete("/api/models/_sandbox_test_model/")
    assert r.status_code in (200, 204), f"Delete failed: {r.status_code}"


def main():
    parser = argparse.ArgumentParser(description="Sandbox endpoint tests")
    parser.add_argument("--port", type=int, default=8001, help="Server port (default: 8001)")
    args = parser.parse_args()

    base_url = f"http://localhost:{args.port}"
    client = make_client(base_url)

    # Collect all test functions
    tests = [
        (name, func)
        for name, func in globals().items()
        if name.startswith("test_") and callable(func)
    ]

    passed = 0
    failed = 0
    errors = []

    print(f"\nSandbox tests against {base_url}")
    print("=" * 50)

    for name, func in sorted(tests):
        try:
            func(client)
            print(f"  PASS  {name}")
            passed += 1
        except Exception as e:
            print(f"  FAIL  {name}: {e}")
            failed += 1
            errors.append((name, str(e)))

    print("=" * 50)
    print(f"{passed} passed, {failed} failed")

    if errors:
        print("\nFailures:")
        for name, err in errors:
            print(f"  - {name}: {err}")

    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
