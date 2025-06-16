from visivo.models.dashboard import Dashboard
from tests.factories.model_factories import DashboardFactory

from pydantic import ValidationError


def test_Dashboard_simple_data():
    data = {"name": "development"}
    dashboard = Dashboard(**data)
    assert dashboard.name == "development"


def test_Dashboard_missing_data():
    try:
        Dashboard()
    except ValidationError as e:
        error = e.errors()[0]
        assert error["msg"] == "Field required"
        assert error["type"] == "missing"
