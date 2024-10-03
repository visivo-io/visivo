from visivo.models.base.parent_model import ParentModel
from tests.factories.model_factories import TraceFactory


def test_Project_filter_trace():
    traces = []
    assert ParentModel.filtered(pattern="trace", objects=traces) == []

    cat_trace = TraceFactory(name="cat")
    bobcat_trace = TraceFactory(name="bobcat")
    traces = [cat_trace, bobcat_trace]
    assert ParentModel.filtered(pattern="cat", objects=traces) == [
        cat_trace,
        bobcat_trace,
    ]

    cat_trace = TraceFactory(name="cat")
    bobcat_trace = TraceFactory(name="bobcat")
    traces = [cat_trace, bobcat_trace]
    assert ParentModel.filtered(pattern="^cat", objects=traces) == [cat_trace]
    assert ParentModel.filtered(pattern="trace", objects=traces) == []

    cat_trace = TraceFactory(name="cat")
    bobcat_trace = TraceFactory(name="bobcat")
    traces = [cat_trace, bobcat_trace]
    assert ParentModel.filtered(pattern="cat", objects=traces) == [
        cat_trace,
        bobcat_trace,
    ]

    cat_trace = TraceFactory(name="cat")
    bobcat_trace = TraceFactory(name="bobcat")
    traces = [cat_trace, bobcat_trace]
    assert ParentModel.filtered(pattern="^cat", objects=traces) == [cat_trace]


