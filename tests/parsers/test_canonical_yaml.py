"""VIS-1196: the canonical project formatter.

The property that matters most is that formatting is **information-preserving**.
Once the cloud writes YAML into a customer's repo the repo is the source of
truth, so a key silently dropped or a value silently changed is authoritative
data loss — invisible in review, surfacing later as a dashboard that stopped
rendering.
"""

import yaml

from visivo.parsers.canonical_yaml import (
    canonicalize,
    format_text,
    key_order_for_project_key,
    project_key_order,
)


def plain(value):
    """Compare as plain dicts, never as loaded YAML mappings.

    `setup_yaml_ordered_dict()` registers `YamlOrderedDict` globally on
    `yaml.SafeLoader`, and it extends `OrderedDict` — whose `__eq__` is
    ORDER-SENSITIVE. So once anything in the process has triggered that
    registration, `yaml.safe_load(a) == yaml.safe_load(b)` reports every
    reordering as a difference, which is precisely what this formatter does on
    purpose. The test passes alone and fails in the full suite otherwise.

    Worth carrying to VIS-1198: the round-trip fidelity harness compares parsed
    structures, so it has to convert the same way or it will fail on key order
    rather than on lost data.
    """
    if isinstance(value, dict):
        return {key: plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [plain(item) for item in value]
    return value


UNFORMATTED = """\
name: demo

models:
  - sql: SELECT 1 as x
    name: orders
    source: ${ref(db)}

sources:
  - database: local.db
    type: sqlite
    name: db
"""


class TestNothingIsLost:
    def test_formatting_never_changes_meaning(self):
        assert plain(yaml.safe_load(format_text(UNFORMATTED))) == plain(yaml.safe_load(UNFORMATTED))

    def test_a_key_the_formatter_does_not_know_is_kept(self):
        """An unknown key is far more likely to be a newer Visivo version's
        field than a mistake. Dropping it would be data loss."""
        text = "sources:\n  - name: db\n    type: sqlite\n    some_future_key: keep me\n"

        formatted = format_text(text)

        assert "some_future_key: keep me" in formatted
        assert plain(yaml.safe_load(formatted)) == plain(yaml.safe_load(text))

    def test_comments_survive(self):
        text = "# top comment\nname: demo\nmodels:\n  # about orders\n  - name: orders\n    sql: SELECT 1\n"

        formatted = format_text(text)

        assert "# top comment" in formatted
        assert "# about orders" in formatted

    def test_an_empty_document_is_returned_unchanged(self):
        assert format_text("") == ""
        assert format_text("# just a comment\n") == "# just a comment\n"


class TestCanonicalOrder:
    def test_name_leads_and_type_follows_it(self):
        """`name` is identity and `type` is the discriminator, whatever order
        the model happens to declare them in — SqliteSource declares `type`
        tenth, which is an inheritance artifact rather than an authoring order.
        """
        order = key_order_for_project_key("sources")

        assert order[0] == "name"
        assert order[1] == "type"

    def test_order_is_derived_from_the_models(self):
        """Not a hand-maintained list — a model's own field order, so the
        formatter cannot drift from the schema."""
        assert key_order_for_project_key("models")[:3] == ["name", "sql", "source"]

    def test_every_project_key_resolves_its_variants(self):
        """`sources` is ten classes and `dashboards` two, wrapped in NewType and
        Annotated layers by generate_ref_field. If unwrapping regresses, the
        order silently becomes empty and nothing gets sorted."""
        for project_key in ("sources", "models", "dashboards", "inputs", "metrics"):
            assert key_order_for_project_key(project_key), project_key

    def test_keys_are_reordered_within_an_object(self):
        formatted = format_text(UNFORMATTED)
        model_block = formatted.split("models:")[1]

        assert model_block.index("name: orders") < model_block.index("sql:")

    def test_tool_written_keys_sort_after_authored_ones(self):
        """`cli_version` and friends are written by tooling, so they belong
        after the content rather than between `name` and `includes`."""
        order = project_key_order()

        assert "cli_version" not in order
        assert order[:2] == ["name", "defaults"]


class TestIdempotence:
    def test_formatting_twice_changes_nothing_the_second_time(self):
        once = format_text(UNFORMATTED)

        assert format_text(once) == once

    def test_an_already_canonical_document_is_untouched(self):
        once = format_text(UNFORMATTED)

        assert format_text(once) == once


class TestScalars:
    def test_multiline_sql_becomes_a_block_scalar(self):
        text = 'models:\n  - name: m\n    sql: "SELECT 1\\nFROM t"\n'

        formatted = format_text(text)

        assert "sql: |-" in formatted or "sql: |" in formatted
        assert yaml.safe_load(formatted)["models"][0]["sql"] == "SELECT 1\nFROM t"

    def test_a_single_line_string_stays_inline(self):
        formatted = format_text("models:\n  - name: m\n    sql: SELECT 1\n")

        assert "sql: SELECT 1" in formatted


class TestListOrder:
    def test_list_order_is_never_changed(self):
        """Dashboard rows and their items render in the order they appear, and
        there is no way to tell a semantic list from an incidental one without
        knowing the type — so none are sorted."""
        text = (
            "dashboards:\n"
            "  - name: d\n"
            "    rows:\n"
            "      - height: medium\n"
            "      - height: small\n"
            "      - height: large\n"
        )

        heights = [
            row["height"] for row in yaml.safe_load(format_text(text))["dashboards"][0]["rows"]
        ]

        assert heights == ["medium", "small", "large"]


def test_canonicalize_returns_non_mapping_input_untouched():
    assert canonicalize(None) is None
    assert canonicalize([1, 2]) == [1, 2]
