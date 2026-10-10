"""The per-trace research entries (VIS-1419): one validated YAML per Plotly
trace type plus the table entry, loaded by file name, reported by author and
review state. The template is enforced here before any entry is authored."""

from pathlib import Path

import pytest

from visivo.agent.charting import families_export, report, rules
from visivo.agent.charting.schema import KNOWN_TYPES, TABLE_TYPES, TraceEntry
from visivo.models.props.types import PropType

REPO_ROOT = Path(__file__).resolve().parents[3]

ENTRY = """\
type: bar
family: bar
tier: extended
author: opus-4.1
confidence: 0.7
one_liner: Compare a metric across a few categories.
use_when: [one categorical dimension]
avoid_when: [more than ~20 categories]
data_shape:
  metrics: {min: 1}
  dimensions: {min: 1, max: 2}
minimal_yaml: |
  insights:
    - name: x
      props:
        type: bar
"""


@pytest.fixture(scope="module")
def entries():
    return rules.load_traces()


class TestTheLoader:
    def test_files_are_named_after_their_type(self, tmp_path):
        (tmp_path / "scatter.yml").write_text(ENTRY)

        with pytest.raises(ValueError, match="named 'scatter' but the entry is 'bar'"):
            rules.load_traces(tmp_path)

    def test_a_bad_entry_names_its_file(self, tmp_path):
        (tmp_path / "bar.yml").write_text(ENTRY.replace("confidence: 0.7\n", ""))

        with pytest.raises(ValueError, match=r"(?s)bar\.yml.*confidence"):
            rules.load_traces(tmp_path)

    def test_a_non_mapping_is_refused(self, tmp_path):
        (tmp_path / "bar.yml").write_text("- just\n- a list\n")

        with pytest.raises(ValueError, match="expected a mapping"):
            rules.load_traces(tmp_path)

    def test_entries_come_back_sorted_by_type(self, tmp_path):
        (tmp_path / "bar.yml").write_text(ENTRY)
        (tmp_path / "scatter.yml").write_text(ENTRY.replace("type: bar", "type: scatter"))

        assert [e.type for e in rules.load_traces(tmp_path)] == ["bar", "scatter"]


class TestTheShippedEntries:
    def test_every_entry_validates(self, entries):
        assert all(isinstance(e, TraceEntry) for e in entries)

    def test_no_entry_claims_an_unknown_type(self, entries):
        assert {e.type for e in entries} <= KNOWN_TYPES

    def test_every_prop_type_has_an_entry(self, entries):
        """The sync test: PropType is the authority on what Plotly types
        exist; every one of them gets a research entry, and `table` covers
        both table types."""
        assert {e.type for e in entries} - set(TABLE_TYPES) == {p.value for p in PropType}
        assert "table" in {e.type for e in entries}

    def test_every_cited_example_exists(self, entries):
        missing = [e.example for e in entries if e.example and not (REPO_ROOT / e.example).exists()]
        assert missing == []

    def test_core_entries_are_fable_authored(self, entries):
        off = [e.type for e in entries if e.tier == "core" and not e.author.startswith("fable")]
        assert off == []

    def test_extended_entries_are_opus_authored(self, entries):
        off = [e.type for e in entries if e.tier == "extended" and not e.author.startswith("opus")]
        assert off == []


class TestTheReport:
    def test_lists_every_entry_with_its_markers(self):
        entry = TraceEntry(
            type="bar",
            family="bar",
            tier="core",
            author="fable-5.1",
            review={"state": "approved", "by": "jared", "date": "2026-10-10"},
            one_liner="Compare.",
            use_when=["a"],
            avoid_when=["b"],
            data_shape={},
            minimal_yaml="props:\n  type: bar\n",
            example="x.yml",
        )
        extended = TraceEntry(
            type="violin",
            family="distribution",
            tier="extended",
            author="opus-4.1",
            confidence=0.6,
            one_liner="Shape.",
            use_when=["a"],
            avoid_when=["b"],
            data_shape={},
            minimal_yaml="props:\n  type: violin\n",
        )

        text = report.render([entry, extended])

        assert "bar" in text and "approved by jared" in text
        assert "violin" in text and "0.60" in text
        assert "2 entries" in text
        assert "by author: fable-5.1 1, opus-4.1 1" in text
        assert "core approved 1, extended pending 1" in text

    def test_main_writes_the_shipped_table(self, monkeypatch):
        import io

        monkeypatch.setattr(report, "load_traces", lambda: [])
        out = io.StringIO()

        assert report.main(out=out) == 0
        assert "0 entries" in out.getvalue()


class TestReviewMarkers:
    """VIS-1425: the review bar from 00-method.md. Extended entries carry
    Fable's spot-check; core entries wait for Jared, the reviewer of record,
    so that assertion is strict-xfail until he flips them."""

    def test_every_extended_entry_was_spot_checked(self, entries):
        unchecked = [
            e.type
            for e in entries
            if e.tier == "extended" and (e.review.state != "approved" or not e.review.by)
        ]
        assert unchecked == []

    @pytest.mark.xfail(strict=True, reason="core entries await Jared's approval (VIS-1425)")
    def test_every_core_entry_is_approved(self, entries):
        pending = [e.type for e in entries if e.tier == "core" and e.review.state != "approved"]
        assert pending == []


class TestFamiliesJson:
    def test_committed_file_equals_the_rendered_one(self):
        assert families_export.FAMILIES_JSON.read_text() == families_export.dumps()

    def test_every_type_appears_once_per_family_it_names(self, entries):
        rendered = families_export.render(entries)
        claimed = [t for f in rendered["families"] for t in f["trace_types"]]
        assert sorted(set(claimed)) == sorted({e.type for e in entries})
        # scatter serves line, area and xy; everything else has one home.
        assert claimed.count("scatter") == 3 and claimed.count("scattergl") == 2
        assert all(claimed.count(t) == 1 for t in set(claimed) - {"scatter", "scattergl"})

    def test_families_with_no_entry_are_omitted(self, entries):
        only_bar = [e for e in entries if e.type == "bar"]

        assert [f["name"] for f in families_export.render(only_bar)["families"]] == ["bar"]

    def test_main_writes_the_file(self, tmp_path, monkeypatch):
        import io

        target = tmp_path / "families.json"
        monkeypatch.setattr(families_export, "FAMILIES_JSON", target)
        out = io.StringIO()

        assert families_export.main(out=out) == 0
        assert target.exists() and "wrote" in out.getvalue()
