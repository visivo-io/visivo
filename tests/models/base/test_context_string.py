from visivo.models.base.parent_model import ParentModel
from tests.factories.model_factories import TraceFactory


def test_Project_filter_trace():
    traces = []
    assert ParentModel.filtered(pattern="trace", objects=traces) == []