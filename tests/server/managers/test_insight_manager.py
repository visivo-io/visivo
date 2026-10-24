import pytest

from tests.factories.model_factories import SourceFactory
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project

from visivo.models.inputs.types.multi_select import MultiSelectInput
from visivo.server.managers.insight_manager import InsightManager
from visivo.server.managers.object_manager import ObjectStatus, SaveRefusedError

UNWRAPPED = "?{ ${ref(sales).region} IN ${ref(regions).values} }"
HINT = "wrap the values in parentheses: IN (${ref(regions).values})"


def _config(name="by_region", filter_text=None):
    config = {"name": name, "props": {"type": "bar", "x": "?{ ${ref(sales).region} }"}}
    if filter_text:
        config["interactions"] = [{"filter": filter_text}]
    return config


def _with_regions_input(manager):
    regions = MultiSelectInput(name="regions", label="Regions", options=["North", "South"])
    manager.input_lookup = {"regions": regions}.get
    return manager


class TestFilterCheck:
    def test_save_from_config_refuses_unwrapped_values_with_the_hint(self):
        manager = _with_regions_input(InsightManager())

        with pytest.raises(SaveRefusedError, match=r"wrap the values in parentheses"):
            manager.save_from_config(_config(filter_text=UNWRAPPED))

        assert "by_region" not in manager.cached_objects

    def test_validate_config_reports_it(self):
        manager = _with_regions_input(InsightManager())

        result = manager.validate_config(_config(filter_text=UNWRAPPED))

        assert result["valid"] is False
        assert HINT in result["error"]

    def test_without_an_input_lookup_the_ref_reads_as_a_column(self):
        """`region IN regions.values` parses, so only a wired manager knows
        `regions` is a multi-select."""
        manager = InsightManager()

        assert manager.validate_config(_config(filter_text=UNWRAPPED))["valid"] is True

    def test_without_an_input_lookup_a_broken_filter_is_still_refused(self):
        manager = InsightManager()

        result = manager.validate_config(_config(filter_text="?{ ${ref(sales).region} IN ( }"))

        assert result["valid"] is False and "not valid SQL" in result["error"]

    def test_a_lookup_that_fails_is_reported_not_raised(self):
        manager = InsightManager()

        def broken_lookup(name):
            raise RuntimeError("input store unavailable")

        manager.input_lookup = broken_lookup

        result = manager.validate_config(_config(filter_text=UNWRAPPED))

        assert result == {"valid": False, "error": "input store unavailable"}

    def test_every_save_runs_the_check(self):
        manager = _with_regions_input(InsightManager())
        insight = manager.validate_object(_config(filter_text=UNWRAPPED))

        with pytest.raises(SaveRefusedError, match="not valid SQL"):
            manager.save(insight.name, insight)

        assert manager.get("by_region") is None

    def test_loading_a_project_does_not_run_the_check(self):
        """A stored insight with a broken filter stays readable, so it can be
        fixed; the build reports it."""
        manager = _with_regions_input(InsightManager())
        insight = manager.validate_object(_config(filter_text=UNWRAPPED))
        source = SourceFactory()
        sales = SqlModel(name="sales", sql="select 1 as region", source=f"ref({source.name})")
        regions = MultiSelectInput(name="regions", label="Regions", options=["North", "South"])
        project = Project(
            name="p",
            sources=[source],
            models=[sales],
            inputs=[regions],
            insights=[insight],
            dashboards=[],
        )

        manager.load(project.dag())

        assert manager.get("by_region") == insight

    def test_a_static_filter_parses_in_the_dialect_the_lookup_gives(self):
        manager = InsightManager()
        config = _config(filter_text="?{ `region` = 'North' }")

        manager.dialect_lookup = lambda insight: "mysql"
        assert manager.validate_config(config)["valid"] is True

        manager.dialect_lookup = lambda insight: "postgres"
        assert "not valid SQL" in manager.validate_config(config)["error"]


class TestReading:
    def test_get_insight_with_status_is_none_for_an_unknown_name(self):
        assert InsightManager().get_insight_with_status("nope") is None

    def test_all_insights_include_a_deleted_published_one(self):
        manager = InsightManager()
        published = manager.validate_object(_config("old"))
        manager._published_objects["old"] = published
        manager.save_from_config(_config("new"))
        manager.mark_for_deletion("old")

        statuses = {i["name"]: i["status"] for i in manager.get_all_insights_with_status()}

        assert statuses == {"new": ObjectStatus.NEW.value, "old": ObjectStatus.DELETED.value}

    def test_a_deleted_draft_with_no_published_copy_is_left_out(self):
        manager = InsightManager()
        manager._cached_objects["gone"] = None

        assert manager.get_all_insights_with_status() == []

    def test_insights_list_skips_deleted_ones(self):
        manager = InsightManager()
        manager.save_from_config(_config("kept"))
        manager._cached_objects["gone"] = None

        assert [i.name for i in manager.get_insights_list()] == ["kept"]
