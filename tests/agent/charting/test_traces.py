"""The per-trace rule entries: one validated YAML per Plotly trace type plus
the table entry, loaded by file name."""

import pytest
import yaml

from visivo.agent.charting import families_export, rules
from visivo.agent.charting.schema import KNOWN_TYPES, TABLE_TYPES, TraceEntry
from visivo.models.insight import Insight
from visivo.models.props.types import PropType
from visivo.models.table import Table

ENTRY = """\
type: bar
family: bar
one_liner: Compare a metric across a few categories.
use_when: [one categorical dimension]
avoid_when: [more than ~20 categories]
data_shape:
  metrics: {min: 1}
  dimensions: {min: 1, max: 2}
example: |
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
        (tmp_path / "bar.yml").write_text(ENTRY.replace("family: bar\n", ""))

        with pytest.raises(ValueError, match=r"(?s)bar\.yml.*family"):
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

    @pytest.mark.parametrize("entry", rules.load_traces(), ids=lambda e: e.type)
    def test_every_example_is_a_valid_project_object(self, entry):
        """The agent copies these, so each must load as a real Insight or Table."""
        snippet = yaml.safe_load(entry.example)
        objects = [Insight(**i) for i in snippet.get("insights", [])]
        objects += [Table(**t) for t in snippet.get("tables", [])]
        assert objects

    def test_every_variation_names_its_condition(self, entries):
        unnamed = [e.type for e in entries for v in e.variations if v.when.strip() in ("", "TODO")]
        assert unnamed == []


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
