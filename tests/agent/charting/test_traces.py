"""The per-trace research entries (VIS-1419): one validated YAML per Plotly
trace type plus the table entry, loaded by file name, reported by author and
review state. The template is enforced here before any entry is authored."""

from pathlib import Path

import pytest

from visivo.agent.charting import report, rules
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

    @pytest.mark.xfail(strict=True, reason="VIS-1420..1424 author the 48 entries in this PR")
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
