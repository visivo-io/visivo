"""VIS-1329: a model's SQL is checked when it is saved, not only when it is run.

Two checks and only two — it parses, and every projection carries a name the
database will return. Both are true or false regardless of what the source
contains, which is what makes them safe to enforce at save time: no cached
source schema is needed, so a project that has never been introspected is
judged the same as one that has.
"""

import json
import os

import pytest

from visivo.server.flask_app import FlaskApp
from tests.factories.model_factories import ProjectFactory


@pytest.fixture
def client(tmp_path):
    project = ProjectFactory.build()
    output_dir = str(tmp_path / "target")
    os.makedirs(os.path.join(output_dir, "main"), exist_ok=True)
    app = FlaskApp(output_dir=output_dir, project=project).app
    app.config["TESTING"] = True
    return app.test_client()


def _save(client, sql, name="m"):
    return client.post(
        f"/api/models/{name}/",
        data=json.dumps({"name": name, "sql": sql}),
        content_type="application/json",
    )


def test_sql_that_does_not_parse_is_refused(client):
    response = _save(client, "SELECT FROM WHERE ORDER (")

    assert response.status_code == 400
    assert "does not parse" in response.get_json()["error"]


def test_an_unaliased_projection_is_refused(client):
    response = _save(client, "SELECT date_trunc('day', created_at), count(*) FROM t GROUP BY 1")

    assert response.status_code == 400
    error = response.get_json()["error"]
    assert "no alias" in error
    assert "column 1" in error and "column 2" in error
    # Says what to write, not just what is wrong.
    assert "${ref(m)" in error


def test_the_aliased_form_saves(client):
    response = _save(
        client,
        "SELECT date_trunc('day', created_at) as day, count(*) as row_count FROM t GROUP BY 1",
    )

    assert response.status_code in (200, 201)


def test_a_star_select_saves(client):
    """`*` carries whatever names the source has — nothing to object to."""
    assert _save(client, "SELECT * FROM t").status_code in (200, 201)


def test_an_unknown_table_still_saves(client):
    """Deliberately NOT validated here: answering it needs the source's cached
    schema, and a source that has never been introspected has none — so asking
    would reject good SQL from exactly the projects least able to prove
    otherwise. The run still checks it."""
    assert _save(client, "SELECT a AS b FROM a_table_that_does_not_exist").status_code in (200, 201)


def test_the_validate_endpoint_reports_the_same_problem(client):
    response = client.post(
        "/api/models/m/validate/",
        data=json.dumps({"name": "m", "sql": "SELECT count(*) FROM t"}),
        content_type="application/json",
    )

    assert response.status_code == 400
    body = response.get_json()
    assert body["valid"] is False
    assert "no alias" in body["error"]


def test_a_model_with_no_sql_is_not_blocked(client):
    """Not every model carries SQL, and an empty editor is not an error."""
    response = client.post(
        "/api/models/m/",
        data=json.dumps({"name": "m", "sql": ""}),
        content_type="application/json",
    )

    assert response.status_code != 400


def test_a_dialect_that_cannot_be_resolved_never_condemns_the_sql():
    """A source we can't resolve yields a garbage dialect, and that is not the
    author's fault — perfectly good SQL must not be reported as unparseable."""
    from visivo.server.model_sql_validation import validate_model_sql

    assert validate_model_sql("SELECT a AS b FROM t", object(), "m") is None
    assert validate_model_sql("SELECT a AS b FROM t", "not_a_real_dialect", "m") is None
    # The alias check still runs once it falls back to the generic parse.
    assert "no alias" in validate_model_sql("SELECT count(*) FROM t", "not_a_real_dialect", "m")
