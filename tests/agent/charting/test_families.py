"""families.yml, transforms.yml and pairings.yml: the family layer holds
only judgement, every number stays in the trace entries, and every name an
entry uses resolves to a rule file."""

import pytest
import yaml
from pydantic import ValidationError

from visivo.agent.charting import rules
from visivo.agent.charting.schema import (
    FAMILIES,
    Pairing,
    PairingsDoc,
    Transform,
    TransformsDoc,
    split_pairing,
)
from visivo.models.chart import Chart
from visivo.models.insight import Insight


@pytest.fixture(scope="module")
def doc():
    return rules.load_family_doc()


@pytest.fixture(scope="module")
def entries():
    return rules.load_traces()


def _write(tmp_path, families):
    path = tmp_path / "families.yml"
    penalties = {"out_of_range": 0.3, "repair": 0.1, "niche": 0.5}
    path.write_text(yaml.safe_dump({"penalties": penalties, "families": families}))
    return path


class TestTheFamilies:
    def test_every_family_in_the_taxonomy_plus_the_pivot(self, doc):
        assert [f.name for f in doc.families] == [*FAMILIES, "table_pivot"]

    def test_every_family_names_a_skill(self, doc):
        assert all(f.skill and f.skill.startswith("charts/") for f in doc.families)

    def test_members_are_the_entries_themselves(self, doc, entries):
        """The sync test: a family's ranges, repairs, pairings, variations and
        layout are its entries' own, so the two cannot disagree."""
        by_type = {e.type: e for e in entries}
        for family in doc.families:
            assert [m.type for m in family.members][: len(family.trace_types)] == family.trace_types
            for member in family.members:
                assert member == by_type[member.type]
                assert family.name in member.families()

    def test_every_entry_is_claimed_by_each_family_it_names(self, doc, entries):
        members = {(m.type, f.name) for f in doc.families for m in f.members}
        assert {(e.type, family) for e in entries for family in e.families()} <= members

    def test_only_a_family_without_entries_carries_its_own_shape(self, doc):
        for family in doc.families:
            assert (family.data_shape is None) == bool(family.members), family.name
            assert (family.layout is None) == bool(family.members), family.name

    def test_tables_are_families_without_trace_types(self, doc):
        by_name = {f.name: f for f in doc.families}
        assert by_name["table"].trace_types == [] and by_name["table_pivot"].trace_types == []
        assert [m.type for m in by_name["table"].members] == ["table"]
        assert by_name["table"].skeleton == "table" and by_name["table_pivot"].skeleton == "pivot"


class TestTheLoaderRefuses:
    def test_a_claim_on_an_entry_of_another_family(self, tmp_path):
        path = _write(tmp_path, [{"name": "bar", "trace_types": ["pie"], "skill": "charts/bar"}])
        with pytest.raises(ValueError, match="whose entries name other families"):
            rules.load_family_doc(path)

    def test_a_claim_on_a_type_without_an_entry(self, tmp_path, entries):
        path = _write(tmp_path, [{"name": "bar", "trace_types": ["bar"]}])
        with pytest.raises(ValueError, match="have no entry"):
            rules.load_family_doc(path, entries=[e for e in entries if e.type != "bar"])

    def test_an_entry_no_family_claims(self, tmp_path, entries):
        path = _write(tmp_path, [{"name": "bar", "trace_types": ["bar"]}])
        with pytest.raises(ValueError, match=r"no family claims \['pie \(part_of_whole\)'\]"):
            rules.load_family_doc(path, entries=[e for e in entries if e.type in ("bar", "pie")])

    def test_a_family_restating_its_entries(self, tmp_path, entries):
        bar = {"name": "bar", "trace_types": ["bar"], "data_shape": {"metrics": {"min": 1}}}
        path = _write(tmp_path, [bar])
        with pytest.raises(ValueError, match="restates data_shape or layout"):
            rules.load_family_doc(path, entries=[e for e in entries if e.type == "bar"])

    def test_a_family_with_neither_entries_nor_a_shape(self, tmp_path, entries):
        path = _write(tmp_path, [{"name": "bar", "trace_types": ["bar"]}, {"name": "pivot"}])
        with pytest.raises(ValueError, match="pivot has no entries"):
            rules.load_family_doc(path, entries=[e for e in entries if e.type == "bar"])

    def test_members_written_into_the_file(self, tmp_path):
        path = _write(tmp_path, [{"name": "bar", "members": []}])
        with pytest.raises(ValueError, match="members are attached"):
            rules.load_family_doc(path)

    def test_a_duplicate_family(self, tmp_path):
        path = _write(tmp_path, [{"name": "bar"}, {"name": "bar"}])
        with pytest.raises(ValueError, match="duplicate"):
            rules.load_families(path)

    def test_an_empty_file(self, tmp_path):
        path = _write(tmp_path, [])
        with pytest.raises(ValueError, match="non-empty"):
            rules.load_families(path)

    def test_an_unknown_trace_type(self, tmp_path):
        path = _write(tmp_path, [{"name": "bar", "trace_types": ["sparkline"]}])
        with pytest.raises(ValidationError, match="sparkline"):
            rules.load_families(path)

    def test_an_entry_naming_an_undefined_pairing(self, tmp_path, entries):
        bar = next(e for e in entries if e.type == "bar")
        broken = bar.model_copy(update={"pairings": ["bar_beside"]})
        path = _write(tmp_path, [{"name": "bar", "trace_types": ["bar"]}])
        with pytest.raises(ValueError, match="bar: pairing bar_beside"):
            rules.load_family_doc(path, entries=[broken])


class TestEveryNameResolves:
    def test_the_shipped_entries(self, entries):
        assert rules.unresolved_names(entries, rules.load_transforms(), rules.load_pairings()) == []

    def test_each_kind_of_bad_name_is_reported(self, entries):
        bar = next(e for e in entries if e.type == "bar")
        broken = bar.model_copy(
            update={
                "limits": bar.limits.model_copy(update={"repair": ["top_n_other", "squash"]}),
                "transforms": ["squeeze"],
                "alternatives": ["sparkline"],
                "pairings": [
                    "chart_beside(bar)",
                    "chart_beside(sparkline)",
                    "detail_table_below(bar)",
                    "nowhere",
                    "detail_table_below",
                ],
            }
        )
        problems = rules.unresolved_names([broken], rules.load_transforms(), rules.load_pairings())
        assert problems == [
            "bar: repair squash",
            "bar: transform squeeze",
            "bar: alternative sparkline",
            "bar: pairing chart_beside(sparkline)",
            "bar: pairing detail_table_below(bar)",
            "bar: pairing nowhere",
        ]

    def test_a_repair_may_switch_to_another_chart(self, entries):
        histogram = next(e for e in entries if e.type == "histogram")
        assert "box" in histogram.limits.repair
        assert (
            rules.unresolved_names([histogram], rules.load_transforms(), rules.load_pairings())
            == []
        )

    def test_split_pairing(self):
        assert split_pairing("chart_beside(bar)") == ("chart_beside", "bar")
        assert split_pairing("detail_table_below") == ("detail_table_below", None)


class TestTransforms:
    def test_the_card_vocabulary_is_defined(self):
        names = {t.name for t in rules.load_transforms().transforms}
        assert {
            "top_n_other",
            "input_filter",
            "small_multiples",
            "regrain",
            "scattergl",
            "clip_p99",
            "dominant_category",
            "bucket",
            "collapse_rare",
        } <= names

    def test_regrain_steps_climb_the_grains_in_order(self):
        steps = rules.load_transforms().regrain_steps
        assert list(steps) == ["second", "minute", "hour", "day", "week", "month", "quarter"]

    def test_a_broken_file_names_itself(self, tmp_path):
        path = tmp_path / "transforms.yml"
        path.write_text("transforms: []\n")
        with pytest.raises(ValueError, match=r"transforms\.yml"):
            rules.load_transforms(path)
        path.write_text("- a list\n")
        with pytest.raises(ValueError, match="mapping"):
            rules.load_transforms(path)

    def test_names_are_unique_and_roles_scope_a_transform(self):
        one = {"name": "x", "how": "h"}
        with pytest.raises(ValidationError, match="unique"):
            TransformsDoc(transforms=[one, one])
        regrain = Transform(name="regrain", how="h", roles=["time"])
        assert regrain.acts_on("time") and not regrain.acts_on("categorical")
        assert Transform(**one).acts_on("categorical")

    def test_top_n_other_carries_its_other_recipe_into_its_instructions(self):
        top_n = rules.load_transforms().get("top_n_other")
        text = top_n.instructions()
        assert top_n.other.label == "Other" and top_n.other.color in text
        assert "<dim>_rank" in text and "{" not in text.replace("?{", "")
        assert top_n.other.series_color["bar"] == ["marker.color"]
        assert Transform(name="x", how="h {color}").instructions() == "h {color}"

    def test_distribution_types_never_cut_to_top_n_other(self, entries):
        """An Other box or histogram is a mixture that describes no real group."""
        by_type = {e.type: e for e in entries}
        assert "top_n_other" not in by_type["box"].limits.repair
        assert by_type["box"].limits.series_max is None, "categories go on x, not colour"
        assert by_type["histogram"].limits.repair[0] == "box"
        assert "top_n_other" not in by_type["histogram"].limits.repair

    def test_slices_never_leave_other_the_largest(self, entries):
        by_type = {e.type: e for e in entries}
        assert by_type["pie"].limits.other_not_largest
        assert by_type["funnelarea"].limits.other_not_largest
        assert not by_type["scatter"].limits.other_not_largest


class TestPairings:
    @pytest.fixture(scope="class")
    def pairings(self):
        return rules.load_pairings()

    def test_overlays_and_companions_are_split(self, pairings):
        kinds = {p.name: p.kind for p in pairings.pairings}
        assert {n for n, k in kinds.items() if k == "overlay"} == {
            "bar_line_dual_axis",
            "indicator_overlay",
            "scatter_overlay",
            "volume_bar_subplot",
            "carpet_overlay",
        }
        assert {n for n, k in kinds.items() if k == "companion"} == {
            "detail_table_below",
            "kpi_strip_above",
            "kpi_cluster_beside",
            "chart_beside",
        }

    def test_every_overlay_sets_valid_insight_props_and_chart_layout(self, pairings):
        for pairing in pairings.pairings:
            if pairing.kind != "overlay":
                continue
            props = {"type": "carpet", **pairing.insight_props}
            Insight(name="overlay", props=props)
            Chart(name="chart", layout=pairing.chart_layout or None)

    def test_near_duplicates_are_merged(self, entries):
        used = {split_pairing(p)[0] for e in entries for p in e.pairings}
        assert used == {p.name for p in rules.load_pairings().pairings}
        assert {n for n in used if n.endswith("_beside")} == {"chart_beside", "kpi_cluster_beside"}

    def test_alternatives_are_not_pairings(self, entries):
        sunburst = next(e for e in entries if e.type == "sunburst")
        assert sunburst.alternatives == ["treemap"]
        assert not any("toggle" in p or "alternative" in p for e in entries for p in e.pairings)

    def test_the_schema_checks_each_kind(self):
        with pytest.raises(ValidationError, match="needs insight_props or chart_layout"):
            Pairing(name="x", kind="overlay", adds="a")
        with pytest.raises(ValidationError, match="needs a placement and an item"):
            Pairing(name="x", kind="companion", adds="a")
        with pytest.raises(ValidationError, match="sets no chart props"):
            Pairing(
                name="x",
                kind="companion",
                adds="a",
                placement="below",
                item="table",
                insight_props={"type": "bar"},
            )
        one = {"name": "x", "kind": "overlay", "adds": "a", "chart_layout": {"x": 1}}
        with pytest.raises(ValidationError, match="unique"):
            PairingsDoc(pairings=[one, one])

    def test_a_broken_file_names_itself(self, tmp_path):
        path = tmp_path / "pairings.yml"
        path.write_text("pairings: []\n")
        with pytest.raises(ValueError, match=r"pairings\.yml"):
            rules.load_pairings(path)
