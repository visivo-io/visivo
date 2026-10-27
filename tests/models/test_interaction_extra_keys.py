import pytest
from pydantic import ValidationError

from visivo.models.insight import Insight
from visivo.models.interaction import InsightInteraction
from visivo.models.project import Project
from visivo.server.managers.insight_manager import InsightManager

CLICK = "?{ ${ref(orders).region} }"
ORDERS = {"name": "orders", "sql": "select 1 as region, 1 as month", "source": "ref(db)"}
SOURCE = {"name": "db", "type": "duckdb", "database": "db.duckdb"}


def insight_config(interaction):
    return {
        "name": "revenue",
        "props": {"type": "bar", "x": "?{ ${ref(orders).month} }"},
        "interactions": [interaction],
    }


def test_interaction_accepts_filter_split_and_sort():
    interaction = InsightInteraction(filter=CLICK, split=CLICK, sort=CLICK)

    assert set(interaction.field_values) == {"filter", "split", "sort"}


def test_interaction_rejects_unknown_key():
    with pytest.raises(ValidationError) as exc:
        InsightInteraction(click=CLICK)

    error = exc.value.errors()[0]
    assert error["type"] == "extra_forbidden"
    assert error["loc"] == ("click",)


def test_interaction_rejects_unknown_key_next_to_known_key():
    with pytest.raises(ValidationError, match="click"):
        InsightInteraction(filter=CLICK, click=CLICK)


def test_insight_rejects_interaction_with_unknown_key():
    with pytest.raises(ValidationError) as exc:
        Insight(**insight_config({"click": CLICK}))

    error = exc.value.errors()[0]
    assert error["type"] == "extra_forbidden"
    assert error["loc"] == ("interactions", 0, "click")


def test_project_loads_interactions_with_known_keys():
    project = Project(
        name="p",
        sources=[SOURCE],
        models=[ORDERS],
        insights=[
            insight_config({"filter": CLICK}),
            {**insight_config({"sort": CLICK}), "name": "b"},
        ],
    )

    interaction = project.insights[0].interactions[0]
    assert interaction.path == "project.insights[0].interactions[0]"
    assert interaction.field_values == {"filter": "${ref(orders).region}"}


def test_project_rejects_insight_interaction_with_unknown_key():
    with pytest.raises(ValidationError) as exc:
        Project(
            name="p", sources=[SOURCE], models=[ORDERS], insights=[insight_config({"click": CLICK})]
        )

    assert [(e["type"], e["loc"]) for e in exc.value.errors()] == [
        ("extra_forbidden", ("insights", 0, "interactions", 0, "click"))
    ]


def test_insight_manager_refuses_to_save_interaction_with_unknown_key():
    manager = InsightManager()

    with pytest.raises(ValidationError, match="click"):
        manager.save_from_config(insight_config({"click": CLICK}))

    assert manager.get("revenue") is None


def test_insight_manager_validate_config_reports_unknown_interaction_key():
    result = InsightManager().validate_config(insight_config({"click": CLICK}))

    assert result["valid"] is False
    assert "click" in result["error"]
    assert "Extra inputs are not permitted" in result["error"]


def test_insight_manager_saves_interaction_with_known_keys():
    manager = InsightManager()

    insight = manager.save_from_config(insight_config({"filter": CLICK}))

    assert insight.interactions[0].filter.get_value() == "${ref(orders).region}"
