"""The failure paths of the shared draft executor (VIS-1417). The happy path
and the 409/422 branches are exercised through the view and the tool."""

from unittest.mock import Mock

import pytest

from visivo.models.inputs.types.multi_select import MultiSelectInput
from visivo.models.inputs.types.single_select import SingleSelectInput

from visivo.server.services import draft_insight as module
from visivo.server.services.draft_insight import (
    DraftInsightError,
    default_selection,
    execute_draft_insight,
    render_input_value,
    substitute_inputs,
)


def _overlay(insight, monkeypatch):
    monkeypatch.setattr(module, "build_draft_overlay", lambda *a, **k: ("project", "dag", insight))


def test_an_unexpected_overlay_failure_is_a_400(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("overlay exploded")

    monkeypatch.setattr(module, "build_draft_overlay", boom)

    with pytest.raises(DraftInsightError) as refused:
        execute_draft_insight(Mock(), "/tmp", {"name": "x"})
    assert refused.value.status == 400 and "overlay exploded" in refused.value.payload["error"]


def test_a_dependency_walk_failure_is_a_400(monkeypatch):
    insight = Mock()
    insight.get_all_dependent_models.side_effect = ValueError("no such model")
    _overlay(insight, monkeypatch)

    with pytest.raises(DraftInsightError) as refused:
        execute_draft_insight(Mock(), "/tmp", {"name": "x"})
    assert refused.value.status == 400 and "no such model" in str(refused.value)


def test_no_resolvable_source_is_a_400(monkeypatch):
    insight = Mock(name="i")
    insight.get_all_dependent_models.return_value = []
    insight.get_query_info.return_value = Mock(pre_query="SELECT 1")
    insight.get_dependent_source.side_effect = ValueError("no dependent models")
    _overlay(insight, monkeypatch)
    monkeypatch.setattr(module, "build_schema_overrides", lambda dag, schemas: {})

    with pytest.raises(DraftInsightError) as refused:
        execute_draft_insight(Mock(), "/tmp", {"name": "x"})
    assert refused.value.status == 400 and "no dependent models" in str(refused.value)


def test_a_source_execution_failure_is_a_400_with_the_driver_message(monkeypatch):
    insight = Mock()
    insight.get_all_dependent_models.return_value = []
    insight.get_query_info.return_value = Mock(pre_query="SELECT nope")
    insight.get_dependent_source.return_value = Mock()
    _overlay(insight, monkeypatch)
    monkeypatch.setattr(module, "build_schema_overrides", lambda dag, schemas: {})

    def fail(**kwargs):
        raise RuntimeError("no such column: nope")

    monkeypatch.setattr(module, "execute_and_get_result", fail)

    with pytest.raises(DraftInsightError) as refused:
        execute_draft_insight(Mock(), "/tmp", {"name": "x"})
    assert refused.value.status == 400 and "no such column" in refused.value.payload["error"]


def test_a_non_model_not_run_build_failure_is_a_400(monkeypatch):
    insight = Mock()
    insight.get_all_dependent_models.return_value = []
    insight.get_query_info.side_effect = ValueError("bad expression")
    _overlay(insight, monkeypatch)
    monkeypatch.setattr(module, "build_schema_overrides", lambda dag, schemas: {})

    with pytest.raises(DraftInsightError) as refused:
        execute_draft_insight(Mock(), "/tmp", {"name": "x"})
    assert refused.value.status == 400 and refused.value.payload == {"error": "bad expression"}


class TestSubstituteInputs:
    def _app(self, monkeypatch, inputs, loader=None):
        app = Mock(output_dir="/out")
        monkeypatch.setattr(module, "find_input", lambda flask_app, name: inputs.get(name))
        monkeypatch.setattr(
            module, "get_sample_value_for_input", loader or (lambda obj, out, acc: "4")
        )
        return app

    def test_rendering_rules(self):
        assert render_input_value("West", "value") == "'West'"
        assert render_input_value("5", "value") == "5"
        assert render_input_value("O'Hare", "value") == "'O''Hare'"
        assert render_input_value(True, "value") == "TRUE"
        assert render_input_value(2.5, "value") == "2.5"
        assert render_input_value([1, 5], "min") == "1"
        assert render_input_value([1, 5], "first") == "1"
        assert render_input_value([1, 5], "max") == "5"
        assert render_input_value([1, 5], "last") == "5"
        assert render_input_value(["a", "b"], "value") == "'a'"
        assert render_input_value([], "first") == "NULL"
        assert render_input_value(["a", "b"], "values") == "'a', 'b'"

    def test_the_callers_value_wins_else_the_default(self, monkeypatch):
        app = self._app(monkeypatch, {"min_x": Mock()})
        substituted = {}

        out = substitute_inputs(
            app,
            {"a": "x > ${ref(min_x).value}", "b": ["y > ${ref(min_x).value}"]},
            {},
            substituted,
        )

        assert out == {"a": "x > 4", "b": ["y > 4"]} and substituted == {"min_x": {"value": "4"}}
        assert substitute_inputs(app, "x > ${ref(min_x).value}", {"min_x": 2}, {}) == "x > 2"

    def test_a_date_range_previews_its_default_window_as_the_viewer_does(self, monkeypatch):
        """``.min``/``.max`` are the default start and end, raw, as the viewer
        substitutes them: the documented ``'...'::date`` form previews, and an
        unquoted date fails in the preview exactly as it fails on the page. The
        parse-time sample gave the start for both."""
        dates = MultiSelectInput(
            name="pickup_dates",
            range={"start": "2024-01-01", "end": "2024-03-31", "step": "1 day"},
            display={"type": "date-range", "default": {"start": "2024-01-10", "end": "2024-02-20"}},
        )
        app = self._app(monkeypatch, {"pickup_dates": dates}, loader=lambda *a: "2024-01-01")

        documented = substitute_inputs(
            app,
            "d between '${ref(pickup_dates).min}'::date and '${ref(pickup_dates).max}'::date",
            {},
            {},
        )

        assert documented == "d between '2024-01-10'::date and '2024-02-20'::date"
        assert render_input_value(["2024-01-10", "2024-02-20"], "max") == "2024-02-20"

    def test_literal_defaults_are_used_and_queries_fall_back_to_the_sample(self, monkeypatch):
        borough = SingleSelectInput(
            name="borough",
            options=["Manhattan", "Queens"],
            display={"type": "dropdown", "default": {"value": "Queens"}},
        )
        kinds = MultiSelectInput(
            name="kinds",
            options=["a", "b", "c"],
            display={"type": "checkboxes", "default": {"values": ["b", "c"]}},
        )
        queried = SingleSelectInput(
            name="queried",
            options="?{ select distinct x from ${ref(t)} }",
            display={"type": "dropdown", "default": {"value": "?{ select max(x) from ${ref(t)} }"}},
        )
        app = self._app(
            monkeypatch, {"borough": borough, "kinds": kinds, "queried": queried, "bare": Mock()}
        )

        assert default_selection(borough) == "Queens"
        assert default_selection(kinds) == ["b", "c"]
        assert default_selection(queried) is None
        assert (
            substitute_inputs(
                app,
                "${ref(borough).value} ${ref(kinds).values} ${ref(queried).value}",
                {},
                {},
            )
            == "'Queens' 'b', 'c' 4"
        )

    def test_values_all_selects_every_option(self, monkeypatch):
        options = ["a", "b", "c", "d", "e"]
        explicit_all = MultiSelectInput(
            name="explicit_all",
            options=options,
            display={"type": "checkboxes", "default": {"values": "all"}},
        )
        no_default = MultiSelectInput(name="no_default", options=options)
        app = self._app(monkeypatch, {"explicit_all": explicit_all, "no_default": no_default})

        assert default_selection(explicit_all) == options
        assert default_selection(no_default) == options
        assert (
            substitute_inputs(app, "x in (${ref(explicit_all).values})", {}, {})
            == "x in ('a', 'b', 'c', 'd', 'e')"
        )
        assert substitute_inputs(app, "x in (${ref(no_default).values})", {}, {}) == (
            "x in ('a', 'b', 'c', 'd', 'e')"
        )

    def test_values_all_reads_query_options_and_falls_back_when_unavailable(self, monkeypatch):
        queried = MultiSelectInput(
            name="queried",
            options="?{ select distinct x from ${ref(t)} }",
            display={"type": "dropdown", "default": {"values": "all"}},
        )
        ranged = MultiSelectInput(
            name="ranged",
            range={"start": 0, "end": 10, "step": 1},
        )
        monkeypatch.setattr(module, "get_input_options", lambda obj, out: ["x", "y", "z"])
        assert default_selection(queried, "/out") == ["x", "y", "z"]
        assert default_selection(queried) is None
        assert default_selection(ranged, "/out") is None

        def missing(obj, out):
            raise FileNotFoundError()

        monkeypatch.setattr(module, "get_input_options", missing)
        assert default_selection(queried, "/out") is None

    def test_a_repeated_reference_loads_its_options_once(self, monkeypatch):
        loads = []
        app = self._app(monkeypatch, {"min_x": Mock()}, loader=lambda *a: loads.append(a) or "4")

        substitute_inputs(
            app,
            {"a": "${ref(min_x).value} + ${ref(min_x).value}", "b": "${ref(min_x).value}"},
            {},
            {},
        )

        assert len(loads) == 1

    def test_anything_that_is_not_an_input_is_left_alone(self, monkeypatch):
        app = self._app(monkeypatch, {})
        substituted = {}

        assert (
            substitute_inputs(app, "?{${ref(orders).x}}", {}, substituted) == "?{${ref(orders).x}}"
        )
        assert substituted == {} and substitute_inputs(app, 7, {}, substituted) == 7

    def test_a_prop_that_is_the_placeholder_gets_the_bare_value(self, monkeypatch):
        app = self._app(monkeypatch, {"mode": Mock()})

        assert substitute_inputs(app, " ${ref(mode).value} ", {"mode": "markers"}, {}) == "markers"
        assert substitute_inputs(app, "${ref(mode).value}", {"mode": 3}, {}) == "3"
