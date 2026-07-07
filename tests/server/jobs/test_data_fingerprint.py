"""Unit tests for the data fingerprint — the query-relevant subset of a config
that decides whether a save needs a run (ported from core's data_fingerprint)."""

from visivo.server.jobs.data_fingerprint import (
    data_fingerprint,
    has_inline_query,
    is_query_value,
)


class TestQueryValue:
    def test_inline_query_always_counts(self):
        assert is_query_value("?{ ${ref(M).a} }", include_refs=False)
        assert is_query_value("?{ amount }", include_refs=True)
        assert has_inline_query("x ?{ y } z")

    def test_ref_counts_only_when_include_refs(self):
        assert is_query_value("${ref(M).a}", include_refs=True)
        assert not is_query_value("${ref(M).a}", include_refs=False)

    def test_plain_values_never_count(self):
        assert not is_query_value("scatter", include_refs=True)
        assert not is_query_value(42, include_refs=True)
        assert not is_query_value(None, include_refs=True)


class TestWholeMode:
    def test_any_field_change_moves_the_hash(self):
        a = data_fingerprint("whole", {"sql": "select 1", "name": "m"})
        b = data_fingerprint("whole", {"sql": "select 2", "name": "m"})
        assert a != b

    def test_identical_config_is_stable(self):
        cfg = {"host": "db", "port": 5432}
        assert data_fingerprint("whole", cfg) == data_fingerprint("whole", dict(cfg))

    def test_key_order_does_not_matter(self):
        assert data_fingerprint("whole", {"a": 1, "b": 2}) == data_fingerprint(
            "whole", {"b": 2, "a": 1}
        )


class TestQueryMode:
    def test_presentation_change_leaves_hash_unchanged(self):
        base = {"props": {"type": "bar", "x": "?{ ${ref(M).a} }", "marker": {"color": "red"}}}
        recolor = {
            "props": {"type": "scatter", "x": "?{ ${ref(M).a} }", "marker": {"color": "blue"}}
        }
        assert data_fingerprint("query", base) == data_fingerprint("query", recolor)

    def test_query_change_moves_hash(self):
        a = {"props": {"x": "?{ ${ref(M).a} }"}}
        b = {"props": {"x": "?{ ${ref(M).b} }"}}
        assert data_fingerprint("query", a) != data_fingerprint("query", b)

    def test_no_query_leaves_fingerprints_empty(self):
        assert data_fingerprint("query", {"props": {"type": "scatter", "color": "red"}}) == ""
        assert data_fingerprint("query", None) == ""

    def test_ref_is_a_dependency_only_for_data_producing(self):
        cfg = {"x": "${ref(M).a}"}
        # insight (data_producing) — the ref is an upstream dep → counted.
        assert data_fingerprint("query", cfg, data_producing=True) != ""
        # chart/table (not producing) — a ${} is a read of built data → ignored.
        assert data_fingerprint("query", cfg, data_producing=False) == ""

    def test_swapping_positioned_queries_is_detected(self):
        a = {"props": {"x": "?{ ${ref(M).a} }", "y": "?{ ${ref(M).b} }"}}
        b = {"props": {"x": "?{ ${ref(M).b} }", "y": "?{ ${ref(M).a} }"}}
        assert data_fingerprint("query", a) != data_fingerprint("query", b)


class TestDeletion:
    def test_deleting_a_data_producing_resource_forces_a_rebuild(self):
        sentinel = data_fingerprint("query", None, deleted=True, data_producing=True)
        assert sentinel != ""  # a real hash, not the "no data" empty
        live = data_fingerprint("query", {"props": {"x": "?{ ${ref(M).a} }"}}, data_producing=True)
        assert sentinel != live

    def test_non_producing_deletion_uses_the_normal_fingerprint(self):
        # A chart/table deletion isn't a data rebuild — it falls through to query
        # mode (empty here), so the gate treats it as no data change.
        assert data_fingerprint("query", None, deleted=True, data_producing=False) == ""
