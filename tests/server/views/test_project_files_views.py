from unittest.mock import Mock

import pytest
from flask import Flask

from visivo.server.views.project_files_views import register_project_files_views
from visivo.server.views.sources_views import register_source_views


@pytest.fixture
def client():
    app = Flask(__name__)
    flask_app = Mock()
    register_source_views(app, flask_app, "/tmp/output")
    register_project_files_views(app, flask_app, "/tmp/output")
    return app.test_client()


@pytest.mark.parametrize(
    "method,path,issue",
    [
        ("get", "/api/project-files/?ext=csv", "VIS-1283"),
        ("post", "/api/project-files/uploads/", "VIS-1762"),
        ("put", "/api/project-files/uploads/up_1/content/", "VIS-1762"),
        ("post", "/api/project-files/uploads/up_1/complete/", "VIS-1762"),
        ("post", "/api/source-credentials/", "VIS-1764"),
    ],
)
def test_unbuilt_routes_answer_501_in_the_contract_error_shape(client, method, path, issue):
    response = getattr(client, method)(path, json={})

    assert response.status_code == 501
    assert response.get_json() == {
        "error": f"Not available yet ({issue}).",
        "code": "not_implemented",
    }
