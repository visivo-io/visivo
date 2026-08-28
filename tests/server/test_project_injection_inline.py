"""A draft of an INLINE-defined object replaces it, rather than duplicating it.

A chart (or table, or markdown) written directly inside a dashboard item is a
real named object — every manager publishes it — but it is not in the project's
top-level ``charts:`` list. ``inject_cached_objects`` overlaid every draft by
appending to the matching top-level list, which put the same name in the
project twice while the inline copy stayed where it was.

``Project.traverse_names`` rejects a duplicate name, so #640's commit gate
refused with ``Chart name '...' is not unique in the project`` — naming a chart
the user very likely had not touched. Every dashboard-inline chart was
unpublishable, and merely opening one (which loads it into the draft cache)
blocked unrelated commits.
"""

from types import SimpleNamespace

from tests.factories.model_factories import ChartFactory, ProjectFactory
from visivo.models.project import Project
from visivo.server.jobs.project_injection import (
    inject_cached_objects,
    replace_inline_definitions,
)


class _Manager:
    def __init__(self, cached):
        self.cached_objects = cached


def _flask_app(**managers):
    """A stand-in carrying only the manager attributes injection reads."""
    blank = {
        attr: _Manager({})
        for attr in (
            "model_manager",
            "source_manager",
            "dimension_manager",
            "metric_manager",
            "insight_manager",
            "chart_manager",
            "relation_manager",
            "table_manager",
            "dashboard_manager",
            "input_manager",
            "markdown_manager",
        )
    }
    blank.update({attr: _Manager(cached) for attr, cached in managers.items()})
    return SimpleNamespace(**blank)


def _inline_chart(project):
    return project.dashboards[0].rows[0].items[0].chart


def test_an_inline_chart_draft_does_not_become_a_top_level_duplicate():
    project = ProjectFactory()
    name = _inline_chart(project).name
    assert project.charts == [], "premise: the chart is defined only inline"

    draft = ChartFactory(name=name)
    inject_cached_objects(_flask_app(chart_manager={name: draft}), project)

    names = [chart.name for chart in project.charts] + [_inline_chart(project).name]
    assert names.count(name) == 1


def test_the_draft_content_actually_replaces_the_inline_definition():
    """Skipping the duplicate must not mean validating stale content."""
    project = ProjectFactory()
    name = _inline_chart(project).name

    draft = ChartFactory(name=name, layout={"title": {"text": "edited in the draft"}})
    inject_cached_objects(_flask_app(chart_manager={name: draft}), project)

    assert _inline_chart(project).layout.model_dump()["title"]["text"] == "edited in the draft"


def test_the_resulting_project_still_validates():
    """The end-to-end symptom: the commit gate re-constructs the project."""
    project = ProjectFactory()
    name = _inline_chart(project).name

    draft = ChartFactory(name=name, layout={"title": {"text": "edited in the draft"}})
    inject_cached_objects(_flask_app(chart_manager={name: draft}), project)

    Project(**project.model_dump(exclude_none=True))


def test_a_top_level_object_is_still_replaced_in_the_top_level_list():
    """The complement: nothing about the ordinary overlay changes."""
    project = ProjectFactory()
    project.charts = [ChartFactory(name="top_level_chart")]

    draft = ChartFactory(name="top_level_chart", layout={"title": {"text": "edited"}})
    inject_cached_objects(_flask_app(chart_manager={"top_level_chart": draft}), project)

    assert [chart.name for chart in project.charts] == ["top_level_chart"]
    assert project.charts[0].layout.model_dump()["title"]["text"] == "edited"


def test_a_brand_new_object_is_still_appended():
    """A draft that exists nowhere in the project must still be injected."""
    project = ProjectFactory()

    draft = ChartFactory(name="brand_new_chart")
    inject_cached_objects(_flask_app(chart_manager={"brand_new_chart": draft}), project)

    assert "brand_new_chart" in [chart.name for chart in project.charts]


def test_a_name_collision_across_types_is_not_substituted():
    """Only a draft of the SAME type may replace an inline definition."""
    project = ProjectFactory()
    name = _inline_chart(project).name

    replaced = replace_inline_definitions(project, {name: object()})

    assert replaced == set()
    assert _inline_chart(project).name == name
