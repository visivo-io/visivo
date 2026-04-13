from visivo.models.base.parent_model import ParentModel
from tests.factories.model_factories import InsightFactory


def test_Project_filter_insight():
    insights = []
    assert ParentModel.filtered(pattern="insight", objects=insights) == []

    cat_insight = InsightFactory(name="cat")
    bobcat_insight = InsightFactory(name="bobcat")
    insights = [cat_insight, bobcat_insight]
    assert ParentModel.filtered(pattern="cat", objects=insights) == [
        cat_insight,
        bobcat_insight,
    ]

    cat_insight = InsightFactory(name="cat")
    bobcat_insight = InsightFactory(name="bobcat")
    insights = [cat_insight, bobcat_insight]
    assert ParentModel.filtered(pattern="^cat", objects=insights) == [cat_insight]
    assert ParentModel.filtered(pattern="insight", objects=insights) == []

    cat_insight = InsightFactory(name="cat")
    bobcat_insight = InsightFactory(name="bobcat")
    insights = [cat_insight, bobcat_insight]
    assert ParentModel.filtered(pattern="cat", objects=insights) == [
        cat_insight,
        bobcat_insight,
    ]

    cat_insight = InsightFactory(name="cat")
    bobcat_insight = InsightFactory(name="bobcat")
    insights = [cat_insight, bobcat_insight]
    assert ParentModel.filtered(pattern="^cat", objects=insights) == [cat_insight]
