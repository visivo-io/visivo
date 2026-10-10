"""The charting contracts (VIS-1406): shape cards in, rules and
recommendations out. These are validated at load time so a bad rule entry
fails a test rather than producing a bad chart."""

import pytest
from pydantic import ValidationError

from visivo.agent.charting import schema
from visivo.agent.charting.schema import (
    KNOWN_TYPES,
    FamilyRule,
    LayoutRule,
    MinMax,
    Recommendation,
    RecommendRequest,
    RecommendResponse,
    ShapeCard,
    TraceEntry,
    bucket_for,
)
from visivo.models.props.types import PropType


def _entry(**overrides):
    base = dict(
        type="bar",
        family="bar",
        tier="core",
        author="fable-5.1",
        one_liner="Compare a metric across a few categories.",
        use_when=["one categorical dimension"],
        avoid_when=["more than ~20 categories"],
        data_shape={"metrics": {"min": 1}, "dimensions": {"min": 1, "max": 2}},
        minimal_yaml="insights:\n  - name: x\n    props:\n      type: bar\n",
    )
    base.update(overrides)
    return TraceEntry(**base)


class TestCardinalityBuckets:
    @pytest.mark.parametrize(
        "cardinality, bucket",
        [
            (0, "one"),
            (1, "one"),
            (2, "few"),
            (7, "few"),
            (8, "some"),
            (20, "some"),
            (21, "many"),
            (100, "many"),
            (101, "high"),
            (10_000, "high"),
        ],
    )
    def test_the_edges(self, cardinality, bucket):
        assert bucket_for(cardinality) == bucket


class TestShapeCard:
    def test_the_bucket_is_derived_from_cardinality(self):
        assert (
            ShapeCard(column="borough", role="categorical", cardinality=5).cardinality_bucket
            == "few"
        )

    def test_a_stated_bucket_that_disagrees_is_rejected(self):
        with pytest.raises(ValidationError, match="is 'few'"):
            ShapeCard(column="b", role="categorical", cardinality=5, cardinality_bucket="high")

    def test_a_stated_bucket_that_agrees_is_kept(self):
        card = ShapeCard(column="b", role="categorical", cardinality=5, cardinality_bucket="few")

        assert card.cardinality_bucket == "few"

    def test_an_unknown_role_is_rejected(self):
        with pytest.raises(ValidationError):
            ShapeCard(column="b", role="colour", cardinality=1)

    def test_top_n_shares_are_fractions(self):
        with pytest.raises(ValidationError):
            ShapeCard(
                column="b", role="categorical", cardinality=2, top_n=[{"value": "a", "share": 1.5}]
            )

    def test_it_round_trips_as_json(self):
        card = ShapeCard(
            column="pickup_at",
            role="time",
            cardinality=365,
            time_grain="day",
            time_span_points=365,
            stats={"min": "2024-01-01", "max": "2024-12-31"},
        )

        assert ShapeCard(**card.model_dump(mode="json")) == card

    def test_extra_keys_are_rejected(self):
        with pytest.raises(ValidationError):
            ShapeCard(column="b", role="text", cardinality=1, colour="red")


class TestOrderedAxes:
    @pytest.mark.parametrize("role", ["time", "numeric_continuous", "numeric_discrete"])
    def test_time_and_numbers_are_ordered_by_default(self, role):
        assert ShapeCard(column="c", role=role, cardinality=10).is_ordered()

    @pytest.mark.parametrize("role", ["categorical", "boolean", "identifier", "text", "geo_region"])
    def test_everything_else_is_not(self, role):
        assert not ShapeCard(column="c", role=role, cardinality=10).is_ordered()

    def test_an_explicit_flag_wins_either_way(self):
        assert ShapeCard(column="c", role="categorical", cardinality=3, ordered=True).is_ordered()
        assert not ShapeCard(
            column="c", role="numeric_discrete", cardinality=3, ordered=False
        ).is_ordered()

    def test_axis_points_prefers_the_time_span(self):
        assert (
            ShapeCard(column="c", role="time", cardinality=300, time_span_points=365).axis_points()
            == 365
        )
        assert ShapeCard(column="c", role="numeric_discrete", cardinality=24).axis_points() == 24


class TestRecommendRequest:
    def test_there_is_no_global_dimension_cap(self):
        dims = [ShapeCard(column=f"d{i}", role="categorical", cardinality=3) for i in range(6)]

        assert len(RecommendRequest(dimensions=dims).dimensions) == 6

    def test_defaults_are_empty_and_safe(self):
        request = RecommendRequest()

        assert request.metrics == [] and request.intent is None
        assert request.semantics.part_of_whole is False
        assert request.context.max_results == 5

    def test_an_unknown_intent_is_rejected(self):
        with pytest.raises(ValidationError):
            RecommendRequest(intent="dazzle")


class TestMinMax:
    def test_admits_respects_both_ends(self):
        window = MinMax(min=1, max=2)

        assert (
            not window.admits(0) and window.admits(1) and window.admits(2) and not window.admits(3)
        )

    def test_no_max_means_unbounded(self):
        assert MinMax(min=1).admits(10_000)

    def test_an_inverted_window_is_rejected(self):
        with pytest.raises(ValidationError, match="below min"):
            MinMax(min=3, max=1)


class TestFamilyRule:
    def test_a_minimal_rule_validates(self):
        rule = FamilyRule(name="bar", trace_types=["bar"])

        assert rule.layout.row_role == "breakdown" and rule.limits.repair == []

    def test_trace_types_must_be_real(self):
        with pytest.raises(ValidationError, match="unknown trace types"):
            FamilyRule(name="x", trace_types=["sparkline"])

    def test_tables_count_as_types(self):
        assert FamilyRule(name="table", trace_types=["table", "table_pivot"])

    def test_series_limits_are_ordered(self):
        with pytest.raises(ValidationError, match="series_max"):
            FamilyRule(name="line", limits={"series_ideal": 5, "series_max": 3})

    def test_every_score_adjustment_carries_a_reason(self):
        with pytest.raises(ValidationError):
            FamilyRule(name="line", score=[{"when": "intent == trend", "delta": 0.3}])


class TestTraceEntry:
    def test_a_core_entry_needs_no_confidence(self):
        assert _entry().confidence is None

    def test_an_extended_entry_must_state_confidence(self):
        with pytest.raises(ValidationError, match="confidence"):
            _entry(tier="extended")
        assert _entry(tier="extended", confidence=0.6).confidence == 0.6

    def test_the_type_must_be_a_trace_or_table_type(self):
        with pytest.raises(ValidationError, match="not a Plotly trace type"):
            _entry(type="sparkline")
        assert _entry(type="table_pivot").type == "table_pivot"

    def test_use_when_is_capped_at_four(self):
        with pytest.raises(ValidationError):
            _entry(use_when=["a", "b", "c", "d", "e"])

    def test_gotchas_are_capped_at_five(self):
        with pytest.raises(ValidationError):
            _entry(visivo_gotchas=list("abcdef"))

    def test_minimal_yaml_is_capped_at_fifteen_lines(self):
        with pytest.raises(ValidationError, match="15 lines"):
            _entry(minimal_yaml="\n".join(f"k{i}: v" for i in range(16)))

    def test_review_markers_default_to_pending(self):
        assert _entry().review.state == "pending" and _entry().review.by is None

    def test_review_dates_are_dates(self):
        with pytest.raises(ValidationError):
            _entry(review={"state": "approved", "date": "yesterday"})
        assert (
            str(_entry(review={"state": "approved", "date": "2026-10-08"}).review.date)
            == "2026-10-08"
        )

    def test_known_types_track_prop_type(self):
        """When a trace type is added to PropType the rules must learn it;
        when one is removed, an entry for it must stop validating."""
        assert KNOWN_TYPES == {p.value for p in PropType} | {"table", "table_pivot"}
        assert len({p.value for p in PropType}) == 48


class TestLayoutRule:
    def test_widths_are_twelve_unit_columns_per_item_count(self):
        rule = LayoutRule(row_role="hero", max_per_row=2, widths={2: [8, 4]})
        assert rule.widths_for(2) == [8, 4]
        with pytest.raises(ValidationError, match="summing to 12"):
            LayoutRule(row_role="hero", widths={2: [6, 5]})
        with pytest.raises(ValidationError, match="summing to 12"):
            LayoutRule(row_role="hero", widths={2: [12]})
        with pytest.raises(ValidationError, match="exceed max_per_row"):
            LayoutRule(row_role="hero", max_per_row=1, widths={2: [6, 6]})

    def test_an_even_split_is_the_fallback(self):
        rule = LayoutRule(row_role="kpi")
        assert rule.widths_for(3) == [4, 4, 4] and rule.widths_for(1) == [12]
        with pytest.raises(ValueError, match="no width rule for 5"):
            rule.widths_for(5)

    def test_heights_are_row_tokens_or_pixels(self):
        assert LayoutRule(row_role="kpi", height="xsmall").height == "xsmall"
        assert LayoutRule(row_role="kpi", height=180).height == 180
        with pytest.raises(ValidationError, match="not one of"):
            LayoutRule(row_role="kpi", height="huge")
        with pytest.raises(ValidationError, match="positive"):
            LayoutRule(row_role="kpi", height=0)
        assert schema.height_px("medium") == 396 and schema.height_px(300) == 300
        assert schema.height_px("compact") is None
        with pytest.raises(ValueError, match="token or a positive int"):
            schema._check_height(3.5)


class TestLayoutDoc:
    def _doc(self, **overrides):
        base = dict(
            order=["kpi", "hero"],
            rules=[{"row_role": "kpi"}, {"row_role": "hero", "max_per_row": 1}],
        )
        base.update(overrides)
        return schema.LayoutDoc(**base)

    def test_every_ordered_role_needs_a_rule(self):
        with pytest.raises(ValidationError, match="without a rule"):
            self._doc(order=["kpi", "hero", "detail"])

    def test_a_role_has_one_rule_and_one_place_in_the_order(self):
        with pytest.raises(ValidationError, match="one rule only"):
            self._doc(rules=[{"row_role": "kpi"}, {"row_role": "kpi"}, {"row_role": "hero"}])
        with pytest.raises(ValidationError, match="repeats"):
            self._doc(order=["kpi", "kpi", "hero"])

    def test_family_and_detail_heights_are_checked(self):
        with pytest.raises(ValidationError, match="not one of"):
            self._doc(height_by_family={"bar": "tall"})
        with pytest.raises(ValidationError, match="not one of"):
            self._doc(detail_height_by_rows={3: "tiny"})
        assert self._doc().rule("hero").max_per_row == 1

    def test_templates_sum_to_twelve(self):
        with pytest.raises(ValidationError, match="sum to 12"):
            schema.LayoutTemplate(name="x", widths=[6, 5])

    def test_the_kpi_cluster_is_two_columns(self):
        with pytest.raises(ValidationError, match="two ints"):
            schema.KpiCluster(widths=[4, 4, 4])
        with pytest.raises(ValidationError, match="not one of"):
            schema.KpiCluster(sub_row_height="tiny")

    def test_heatmap_height_snaps_up_then_grows(self):
        h = schema.HeatmapHeight()
        assert [h.pick(n) for n in (0, 6, 7, 13, 19, 32, 44)] == [
            "small",
            "small",
            "medium",
            "medium",
            "large",
            "xlarge",
            "xxlarge",
        ]
        assert h.pick(50) == 1128 and h.pick(1000) == 2048


class TestRecommendResponse:
    def test_a_recommendation_must_explain_itself(self):
        with pytest.raises(ValidationError):
            Recommendation(family="bar", score=0.8, why=[])

    def test_the_response_shape(self):
        response = RecommendResponse(
            recommendations=[
                Recommendation(family="bar", trace_type="bar", score=0.8, why=["one categorical"])
            ],
            rejected=[{"family": "line", "reason": "no time dimension"}],
            transforms_suggested=["top_n_other"],
        )

        assert response.model_dump(mode="json")["rejected"] == [
            {"family": "line", "reason": "no time dimension"}
        ]

    def test_the_module_exposes_the_vocabulary_phase_2_renders_from(self):
        for name in ("Role", "Intent", "CardinalityBucket", "GeoKind", "RowRole", "TABLE_TYPES"):
            assert hasattr(schema, name)
