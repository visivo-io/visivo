"""What an injected instruction cannot do (VIS-1340).

Project data is attacker-controllable in any project whose YAML the user did
not write — a model's name, a comment inside its SQL, a dashboard's markdown.
All of it reaches agent context, so all of it is an instruction channel. The
question this file answers is not "can the agent be fooled" — it can — but
"what is the worst a fooled agent achieves".

The claimed answer is the draft tier: every write lands in `cached_objects`,
nothing in the registry commits, so the blast radius is a draft the user can
discard. These are the properties that claim rests on. They were verified by
hand against a running `visivo serve` during the review; they live here so
they stay true.
"""

import json

import pytest

from visivo.agent.tools import TOOLS, _dump, call


class TestTheDraftTierIsInert:
    def test_a_source_carrying_shell_args_stages_without_running_them(
        self, integration_app, tmp_path
    ):
        """The sharpest edge in the schema: `seeds[].args` is handed to
        `subprocess.Popen` by the run phase. Staging one must not be running
        one — the draft is data until a human commits it.
        """
        marker = tmp_path / "executed"
        result = call(
            integration_app,
            "write_source",
            {
                "config": {
                    "name": "injected_probe",
                    "type": "duckdb",
                    "database": "target/probe.duckdb",
                    "seeds": [
                        {
                            "table_name": "t",
                            "args": ["sh", "-c", f"touch {marker}; echo a,b"],
                        }
                    ],
                }
            },
        )

        assert result["status"] == "draft"
        assert not marker.exists(), "staging a draft executed its seed command"

    def test_no_tool_commits_runs_or_deletes(self):
        """The registry is the whole permission model, so its shape IS the
        boundary. A tool that published, ran, or deleted would move the blast
        radius out of the draft tier without anything else having to change.
        """
        forbidden = ("commit", "publish", "deploy", "run_", "delete_", "drop_", "execute")
        offenders = [n for n in TOOLS if any(n.startswith(f) or f in n for f in forbidden)]

        assert offenders == []


class TestSecretsDoNotLeaveThroughAToolResult:
    """A tool result is read by the agent, which in the built-in loop means it
    is sent to whichever model the user configured. Anything a result carries,
    that provider sees."""

    def test_a_password_is_redacted(self):
        from visivo.models.sources.postgresql_source import PostgresqlSource

        source = PostgresqlSource(
            name="warehouse",
            type="postgresql",
            database="analytics",
            host="db.internal",
            username="svc",
            password="hunter2-not-a-real-secret",
        )

        assert "hunter2-not-a-real-secret" not in json.dumps(_dump(source))

    def test_an_env_reference_is_not_resolved_on_the_way_out(self, integration_app, monkeypatch):
        """Otherwise write-then-read is an exfiltration primitive: stage a
        source whose password is `${env.ANYTHING}`, read it back, and the
        serve process has handed over its own environment.
        """
        monkeypatch.setenv("STAGING_DB_PASSWORD", "value-from-the-environment")
        call(
            integration_app,
            "write_source",
            {
                "config": {
                    "name": "env_probe",
                    "type": "postgresql",
                    "database": "d",
                    "host": "h",
                    "username": "u",
                    "password": "${env.STAGING_DB_PASSWORD}",
                }
            },
        )

        read_back = json.dumps(call(integration_app, "get_source", {"name": "env_probe"}))

        assert "value-from-the-environment" not in read_back
        assert "${env.STAGING_DB_PASSWORD}" in read_back


class TestTheEndpointIsNotDriveableByAWebPage:
    def test_a_body_without_the_json_content_type_is_not_parsed(self, integration_client):
        """`visivo serve` has no authentication and binds 0.0.0.0, so the only
        thing standing between a page the user happens to visit and a write
        into their project is the browser's preflight — which a `text/plain`
        POST skips entirely.

        What stops it is that the view parses strictly: no
        `Content-Type: application/json`, no body. Adding `force=True` to that
        `get_json` would hand every site the user visits a write primitive,
        which is why this is a test and not a comment.
        """
        response = integration_client.post(
            "/api/mcp/",
            data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}),
            content_type="text/plain",
        )

        payload = json.loads(response.data)
        assert payload["error"]["code"] == -32700
