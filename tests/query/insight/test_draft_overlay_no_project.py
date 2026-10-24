# -*- encoding: utf-8 -*-

"""Previewing against a project that did not compile.

A failed build leaves `flask_app.project` as None. The agent then writes a
draft, which puts an object in a manager's cache, and every `preview_insight`
died on `type object 'NoneType' has no attribute 'model_fields'` — Pydantic
internals, reported verbatim, about a condition the agent could do nothing
with. It read that as a platform bug, rewrote the model and the insight
repeatedly, and gave up.

The condition is real and worth refusing. The refusal has to name it.
"""

from types import SimpleNamespace

import pytest

from visivo.models.models.sql_model import SqlModel
from visivo.query.insight.draft_overlay import DraftOverlayError, build_draft_overlay
from visivo.server.jobs.project_injection import (
    MANAGER_TO_PROJECT_FIELD,
    NoCompiledProject,
    inject_cached_objects,
)

INSIGHT = {"name": "restaurants_insight", "props": {"type": "scatter"}}


def _app_with_a_cached_draft(project):
    """A server whose project failed to compile, holding one draft — exactly
    the state the agent creates by calling `write_model` and then previewing."""
    manager_attr, _ = MANAGER_TO_PROJECT_FIELD[0]
    manager = SimpleNamespace(
        cached_objects={"restaurants": SqlModel(name="restaurants", sql="SELECT 1")}
    )
    return SimpleNamespace(project=project, **{manager_attr: manager})


class TestPreviewingWithoutACompiledProject:
    def test_it_says_the_project_has_not_compiled(self):
        with pytest.raises(DraftOverlayError) as refused:
            build_draft_overlay(_app_with_a_cached_draft(None), INSIGHT, [], [], [])

        assert "has not compiled" in str(refused.value)

    def test_it_points_at_the_tools_that_explain_why(self):
        """The agent has `list_runs` and `get_run`. A refusal that names them
        is one it can act on; the Pydantic error was not."""
        with pytest.raises(DraftOverlayError) as refused:
            build_draft_overlay(_app_with_a_cached_draft(None), INSIGHT, [], [], [])

        assert "list_runs" in str(refused.value)
        assert "get_run" in str(refused.value)

    def test_the_pydantic_internals_do_not_reach_the_caller(self):
        """`execute_draft_insight` wraps whatever escapes as `str(e)` and hands
        it to the model, so an AttributeError here is what the agent reads."""
        with pytest.raises(DraftOverlayError) as refused:
            build_draft_overlay(_app_with_a_cached_draft(None), INSIGHT, [], [], [])

        assert "model_fields" not in str(refused.value)
        assert "NoneType" not in str(refused.value)


class TestTheSharedOverlayRefusesToo:
    """`inject_cached_objects` is reached by the save-run executor and the
    commit view as well as the preview, so the guard belongs here rather than
    only at the one caller that was reported."""

    def test_a_null_project_is_refused_by_name(self):
        with pytest.raises(NoCompiledProject) as refused:
            inject_cached_objects(_app_with_a_cached_draft(None), None)

        assert "no compiled state" in str(refused.value)

    def test_it_was_an_attribute_error_before(self):
        """Pins the mechanism: the first manager holding a draft walked
        `type(None).model_fields`. A cache with nothing in it never got that
        far, which is why this only appeared once the agent had written
        something."""
        empty = SimpleNamespace(cached_objects={})
        manager_attr, _ = MANAGER_TO_PROJECT_FIELD[0]
        app = SimpleNamespace(project=None, **{manager_attr: empty})

        with pytest.raises(NoCompiledProject):
            inject_cached_objects(app, None)
