import pytest
from pydantic import TypeAdapter, ValidationError

from tests.factories.model_factories import (
    ChartFactory,
    ProjectFactory,
    SqlModelFactory,
    TemplateDashboardFactory,
)
from visivo.models.dashboards.fields import DashboardField
from visivo.models.dashboards.template_dashboard import TemplateDashboard


def test_template_dashboard_children_are_refs_to_its_slots():
    dashboard = TemplateDashboardFactory(
        template='<div data-visivo-item="a"></div><div data-visivo-item="b"></div>'
        '<div data-visivo-item="a"></div>'
    )
    assert dashboard.type == "template"
    assert dashboard.item_names() == ["a", "b"]
    assert dashboard.child_items() == ["ref(a)", "ref(b)"]


def test_template_dashboard_rejects_unsafe_html():
    with pytest.raises(ValidationError) as error:
        TemplateDashboardFactory(template="<div>\n<script>alert(1)</script></div>")
    assert "The HTML in the template is not allowed:" in str(error.value)
    assert "line 2: <script> is not allowed" in str(error.value)


def test_template_dashboard_needs_html():
    with pytest.raises(ValidationError, match="needs a `template`"):
        TemplateDashboard(name="d")


def test_a_template_file_key_is_not_a_template_dashboard():
    """`template_file` was removed before it shipped: the HTML has to travel
    with the config so a runner working from a checkout cannot be missing it.
    The key is no longer recognised, which is a refusal rather than a silent
    empty dashboard."""
    with pytest.raises(ValidationError, match="template_file"):
        TypeAdapter(DashboardField).validate_python({"name": "d", "template_file": "t.html"})


@pytest.mark.parametrize(
    "config, expected",
    [
        ({"name": "d", "template": "<p></p>"}, "TemplateDashboard"),
        ({"name": "d", "rows": []}, "Dashboard"),
        ({"name": "d", "href": "https://x.test"}, "ExternalDashboard"),
        ({"name": "d"}, "Dashboard"),
    ],
)
def test_dashboard_kind_follows_its_keys(config, expected):
    dashboard = TypeAdapter(DashboardField).validate_python(config)
    assert dashboard.__class__.__name__ == expected


def test_project_resolves_template_slots_in_the_dag():
    project = ProjectFactory(chart_ref=True, dashboards=[TemplateDashboardFactory()])
    dashboard = project.dashboards[0]
    assert [node.name for node in project.dag().successors(dashboard)] == ["chart_name"]


def test_project_rejects_a_slot_naming_something_that_is_not_shown():
    model = SqlModelFactory(name="orders")
    with pytest.raises(ValidationError, match="places 'orders', which is a SqlModel"):
        ProjectFactory(
            models=[model],
            dashboards=[TemplateDashboardFactory(template='<div data-visivo-item="orders"></div>')],
        )


def test_project_rejects_a_slot_naming_nothing():
    with pytest.raises(ValidationError, match=r"ref\(chart_name\).*does not point to an object"):
        ProjectFactory(dashboards=[TemplateDashboardFactory()])


def test_template_dashboard_round_trips_through_its_dump():
    dashboard = TemplateDashboardFactory()
    dumped = dashboard.model_dump(exclude_none=True, mode="json")
    assert dumped["type"] == "template"
    assert TypeAdapter(DashboardField).validate_python(dumped) == dashboard
