"""recommend_layout (VIS-1433): rows from items, deterministic over
layout.yml, every row explained, the result a valid Dashboard."""

import pytest
import yaml

from visivo.agent.charting import rules
from visivo.agent.charting.layout import LayoutError, recommend_layout
from visivo.models.dashboard import Dashboard


def chart(name, family, **hints):
    return {"name": name, "kind": "chart", "family": family, "hints": hints}


KPIS = [chart("total", "kpi", importance=3), chart("avg", "kpi", importance=2), chart("tip", "kpi")]
TREND = chart("trend", "line")
BARS = [chart("by-borough", "bar", importance=2), chart("by-pay", "part_of_whole")]
TABLE = {"name": "zones", "kind": "table", "hints": {"rows": 263}}


def rows_of(result, index=0):
    return result["dashboards"][index]["rows"]


def leaf_names(row):
    out = []
    for item in row["items"]:
        for key in ("chart", "table", "input"):
            if key in item:
                out.append(item[key])
        if "rows" in item:
            out.append([leaf_names(r) for r in item["rows"]])
    return out


def depth(rows, level=0):
    deepest = level
    for row in rows:
        for item in row["items"]:
            if "rows" in item:
                deepest = max(deepest, depth(item["rows"], level + 1))
    return deepest


class TestTheRuleFile:
    def test_it_loads_with_every_ordered_role(self):
        doc = rules.load_layout()
        assert doc.order == [
            "inputs",
            "header",
            "kpi",
            "hero",
            "breakdown",
            "relationship",
            "detail",
        ]
        assert {r.row_role for r in doc.rules} == set(doc.order)
        assert doc.grid.max_items == 12 and doc.grid.max_content_rows == 8

    def test_a_broken_file_names_itself(self, tmp_path):
        path = tmp_path / "layout.yml"
        path.write_text("order: [kpi]\nrules: []\n")
        with pytest.raises(ValueError, match=r"layout\.yml"):
            rules.load_layout(path)
        path.write_text("- a list\n")
        with pytest.raises(ValueError, match="mapping"):
            rules.load_layout(path)

    def test_kpis_never_default_to_xsmall(self):
        """An xsmall row leaves no plot area under Plotly's default margins."""
        doc = rules.load_layout()
        assert doc.rule("kpi").height == "small"
        assert doc.height_by_family["kpi"] == "small"


class TestTheGoldenSkeleton:
    """KPI strip + hero + 2-up + detail table, with one global and one
    chart-local input."""

    @pytest.fixture(scope="class")
    def result(self):
        return recommend_layout(
            items=KPIS + [TREND] + BARS + [TABLE],
            title="NYC taxi",
            inputs=[{"name": "borough"}, {"name": "period", "hints": {"chart": "trend"}}],
            intent="trend",
        )

    def test_section_order(self, result):
        names = [leaf_names(r) for r in rows_of(result)]
        assert names[0] == ["${ref(borough)}"], "inputs first"
        assert rows_of(result)[1]["items"][0]["markdown"]["content"] == "# NYC taxi"
        flat = [n for row in names for n in row if isinstance(n, str)]
        assert (
            flat.index("${ref(total)}")
            < flat.index("${ref(trend)}")
            < flat.index("${ref(by-borough)}")
        )
        assert flat[-1] == "${ref(zones)}", "tables last"

    def test_kpi_strip_is_small_and_ordered_by_importance(self, result):
        strip = next(r for r in rows_of(result) if "${ref(total)}" in leaf_names(r))
        assert strip["height"] == "small"
        assert leaf_names(strip) == ["${ref(total)}", "${ref(avg)}", "${ref(tip)}"]
        assert [i["width"] for i in strip["items"]] == [4, 4, 4]

    def test_the_hero_takes_its_local_input_beside_it(self, result):
        hero = next(r for r in rows_of(result) if "${ref(trend)}" in leaf_names(r))
        assert hero["height"] == "large"
        assert [i["width"] for i in hero["items"]] == [8, 4]
        assert hero["items"][1] == {"width": 4, "input": "${ref(period)}"}

    def test_breakdowns_split_evenly_at_medium(self, result):
        row = next(r for r in rows_of(result) if "${ref(by-borough)}" in leaf_names(r))
        assert row["height"] == "medium" and [i["width"] for i in row["items"]] == [6, 6]

    def test_the_detail_table_is_last_full_width_and_large(self, result):
        last = rows_of(result)[-1]
        assert last == {"height": "large", "items": [{"width": 12, "table": "${ref(zones)}"}]}

    def test_section_headers_precede_multi_row_or_heavy_sections(self, result):
        contents = [
            r["items"][0]["markdown"]["content"]
            for r in rows_of(result)
            if "markdown" in r["items"][0]
        ]
        assert any(c.startswith("## The main picture") for c in contents)
        assert any(c.startswith("## Detail") for c in contents)

    def test_every_row_says_why(self, result):
        assert len(result["rows"]) == len(rows_of(result))
        assert all(r["why"] for r in result["rows"])

    def test_the_yaml_round_trips_into_a_dashboard(self, result):
        loaded = yaml.safe_load(result["dashboard_yaml"])
        assert loaded["dashboards"][0]["name"] == "NYC taxi"
        Dashboard(**loaded["dashboards"][0])

    def test_no_warnings_for_a_well_formed_page(self, result):
        assert result["warnings"] == []

    def test_it_is_deterministic(self, result):
        again = recommend_layout(
            items=KPIS + [TREND] + BARS + [TABLE],
            title="NYC taxi",
            inputs=[{"name": "borough"}, {"name": "period", "hints": {"chart": "trend"}}],
            intent="trend",
        )
        assert again["dashboard_yaml"] == result["dashboard_yaml"]


class TestTheKpiCluster:
    def test_related_kpis_stack_beside_the_hero_one_per_sub_row(self):
        result = recommend_layout(
            items=KPIS + [chart("trend", "line", related_kpis=["total", "avg"])], intent="trend"
        )
        hero = next(r for r in rows_of(result) if "${ref(trend)}" in leaf_names(r))
        assert [i["width"] for i in hero["items"]] == [8, 4]
        container = hero["items"][1]["rows"]
        assert [r["height"] for r in container] == ["small", "small"]
        assert [leaf_names(r) for r in container] == [["${ref(total)}"], ["${ref(avg)}"]]
        strip = [r for r in rows_of(result) if "${ref(tip)}" in leaf_names(r)]
        assert len(strip) == 1 and "${ref(total)}" not in leaf_names(strip[0])
        assert depth(rows_of(result)) == 1

    def test_three_kpis_make_the_row_xlarge_and_a_fourth_stays_in_the_strip(self):
        kpis = KPIS + [chart("fourth", "kpi")]
        result = recommend_layout(
            items=kpis + [chart("trend", "line", related_kpis=["total", "avg", "tip", "fourth"])],
            intent="trend",
        )
        hero = next(r for r in rows_of(result) if "${ref(trend)}" in leaf_names(r))
        assert hero["height"] == "xlarge" and len(hero["items"][1]["rows"]) == 3
        assert any("${ref(fourth)}" in leaf_names(r) for r in rows_of(result) if r is not hero)
        assert any("cluster holds 3" in w for w in result["warnings"])

    def test_nesting_never_exceeds_one_level(self):
        result = recommend_layout(
            items=KPIS + [chart("trend", "line", related_kpis=["total"])] + BARS + [TABLE],
            inputs=[
                {"name": "a", "hints": {"chart": "trend"}},
                {"name": "b", "hints": {"chart": "by-borough"}},
            ],
        )
        assert depth(rows_of(result)) <= rules.load_layout().grid.max_depth


class TestHeroSelection:
    def test_intent_promotes_a_matching_family_to_hero(self):
        result = recommend_layout(
            items=[chart("map", "geo_region"), chart("trend", "line")], intent="geo"
        )
        hero_row = rows_of(result)[
            next(i for i, r in enumerate(rows_of(result)) if r["height"] == "large")
        ]
        assert leaf_names(hero_row) == ["${ref(map)}"]
        assert any(
            "${ref(trend)}" in leaf_names(r) and r["height"] == "medium" for r in rows_of(result)
        )

    def test_kpi_intent_has_no_hero(self):
        result = recommend_layout(items=KPIS + [TREND], intent="kpi")
        trend_row = next(r for r in rows_of(result) if "${ref(trend)}" in leaf_names(r))
        assert trend_row["height"] == "medium"
        assert not any("## The main picture" in str(r) for r in rows_of(result))

    def test_two_hero_candidates_keep_the_more_important_one(self):
        result = recommend_layout(items=[chart("a", "line"), chart("b", "line", importance=5)])
        large = [r for r in rows_of(result) if r["height"] == "large"]
        assert len(large) == 1 and leaf_names(large[0]) == ["${ref(b)}"]

    def test_an_explicit_row_role_wins_over_the_family(self):
        result = recommend_layout(items=[{**chart("a", "line"), "row_role": "breakdown"}])
        assert rows_of(result)[0]["height"] == "medium"


class TestHeights:
    def test_tables_size_by_their_rows(self):
        for rows, height in ((3, "small"), (7, "medium"), (8, "large"), (263, "large")):
            result = recommend_layout(
                items=[{"name": "t", "kind": "table", "hints": {"rows": rows}}]
            )
            assert rows_of(result)[-1]["height"] == height, rows

    def test_a_table_without_a_row_count_is_large(self):
        result = recommend_layout(items=[{"name": "t", "kind": "table"}])
        assert rows_of(result)[-1]["height"] == "large"

    def test_heatmaps_grow_with_their_categories(self):
        for n, height in ((7, "medium"), (19, "large"), (30, "xlarge"), (60, 1328)):
            result = recommend_layout(items=[chart("h", "heatmap", n_y_categories=n)])
            assert rows_of(result)[-1]["height"] == height, n

    def test_a_large_family_raises_a_breakdown_row(self):
        result = recommend_layout(items=[chart("t", "hierarchy"), chart("b", "bar")])
        row = next(r for r in rows_of(result) if "${ref(t)}" in leaf_names(r))
        assert row["height"] == "large"

    def test_charts_never_land_in_a_compact_row(self):
        result = recommend_layout(
            items=KPIS + [TREND] + BARS + [TABLE], inputs=[{"name": "x"}], title="t"
        )
        for row in rows_of(result):
            if row["height"] == "compact":
                assert all("markdown" in i or "input" in i for i in row["items"])


class TestInputs:
    def test_global_inputs_come_first_in_one_compact_row(self):
        result = recommend_layout(
            items=[TREND], inputs=[{"name": "a"}, {"name": "b"}, {"name": "c"}]
        )
        first = rows_of(result)[0]
        assert first["height"] == "compact" and [i["width"] for i in first["items"]] == [4, 4, 4]

    def test_more_than_four_global_inputs_warns_and_wraps(self):
        result = recommend_layout(items=[TREND], inputs=[{"name": f"i{n}"} for n in range(5)])
        assert (
            rows_of(result)[0]["height"] == "compact" and rows_of(result)[1]["height"] == "compact"
        )
        assert any("5 global inputs" in w for w in result["warnings"])

    def test_an_input_naming_an_unknown_chart_falls_back_to_global(self):
        result = recommend_layout(items=[TREND], inputs=[{"name": "p", "hints": {"chart": "nope"}}])
        assert leaf_names(rows_of(result)[0]) == ["${ref(p)}"]
        assert any("unknown chart nope" in w for w in result["warnings"])

    def test_two_local_inputs_stack_in_a_container_beside_the_chart(self):
        result = recommend_layout(
            items=[chart("b", "bar")],
            inputs=[{"name": "p", "hints": {"chart": "b"}}, {"name": "q", "hints": {"chart": "b"}}],
        )
        row = rows_of(result)[0]
        assert [i["width"] for i in row["items"]] == [8, 4]
        assert [leaf_names(r) for r in row["items"][1]["rows"]] == [["${ref(p)}"], ["${ref(q)}"]]
        Dashboard(**result["dashboards"][0])


class TestCaps:
    def test_more_than_twelve_charts_split_by_level_with_a_warning(self):
        many = [chart(f"c{n}", "bar") for n in range(15)]
        result = recommend_layout(items=many + [TABLE], title="Ops")
        boards = result["dashboards"]
        assert len(boards) >= 2 and [b["level"] for b in boards] == list(range(len(boards)))
        assert boards[1]["name"] == "Ops (2)"
        assert any("split by level" in w for w in result["warnings"])
        for board in boards:
            Dashboard(**board)
        placed = [n for b in boards for r in b["rows"] for n in leaf_names(r)]
        assert len(placed) == 16 and len(set(placed)) == 16

    def test_the_title_header_repeats_on_every_dashboard(self):
        result = recommend_layout(items=[chart(f"c{n}", "bar") for n in range(15)], title="Ops")
        for board in result["dashboards"]:
            assert board["rows"][0]["items"][0]["markdown"]["content"] == "# Ops"

    def test_two_heavy_rows_back_to_back_warn(self):
        result = recommend_layout(
            items=[
                {**chart("m", "geo_region"), "row_role": "relationship"},
                {**chart("s", "flow"), "row_role": "relationship"},
                {**chart("x", "xy"), "row_role": "relationship"},
            ]
        )
        assert any("large rows back to back" in w for w in result["warnings"])


class TestRefusals:
    def test_duplicate_names_are_refused(self):
        with pytest.raises(LayoutError, match="repeated"):
            recommend_layout(items=[chart("a", "bar"), chart("a", "line")])

    def test_an_unknown_kind_is_refused(self):
        with pytest.raises(Exception, match="kind"):
            recommend_layout(items=[{"name": "a", "kind": "widget"}])

    def test_a_custom_section_header_replaces_the_default_sentence(self):
        result = recommend_layout(items=BARS + [chart("c", "bar", header="Manhattan dominates.")])
        headers = [
            r["items"][0]["markdown"]["content"]
            for r in rows_of(result)
            if "markdown" in r["items"][0]
        ]
        assert any("Manhattan dominates." in h for h in headers)


class TestTheTool:
    def test_it_is_registered_and_returns_the_skeleton(self, integration_app):
        from visivo.agent.tools import TOOLS, call

        assert "recommend_layout" in TOOLS
        result = call(
            integration_app, "recommend_layout", {"items": [chart("a", "bar")], "title": "T"}
        )
        assert "dashboards:" in result["dashboard_yaml"] and result["rows"]

    def test_bad_input_is_a_tool_error(self, integration_app):
        from visivo.agent.tools import ToolError, call

        with pytest.raises(ToolError, match="non-empty list"):
            call(integration_app, "recommend_layout", {"items": []})
        with pytest.raises(ToolError, match="repeated"):
            call(
                integration_app,
                "recommend_layout",
                {"items": [chart("a", "bar"), chart("a", "bar")]},
            )
        with pytest.raises(ToolError, match="Could not lay out"):
            call(integration_app, "recommend_layout", {"items": [{"name": "a", "kind": "widget"}]})
