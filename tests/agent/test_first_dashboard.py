"""The first-dashboard path (VIS-1806): the skill, its eval datasets, the
Example's starter prompts and the scorecard that holds them to a pass bar."""

import importlib.util
import json
import os
import re
import sys

import pytest
import yaml

from visivo.agent import skills, tools

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
EVAL = os.path.join(ROOT, "scripts", "agent_eval")
DATASETS = os.path.join(EVAL, "datasets")
STARTERS = os.path.join(ROOT, "viewer", "src", "components", "agentStarterPrompts.json")


def _module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def scorecard():
    return _module("scorecard", os.path.join(EVAL, "scorecard.py"))


@pytest.fixture(scope="module")
def run_module():
    sys.path.insert(0, EVAL)
    try:
        yield _module("agent_eval_run", os.path.join(EVAL, "run.py"))
    finally:
        sys.path.remove(EVAL)


def _dataset(name):
    with open(os.path.join(DATASETS, name, "prompts.yml")) as handle:
        return yaml.safe_load(handle)


def _skill_text():
    return skills.body("first-dashboard")


class TestTheSkill:
    def test_it_is_on_demand_and_indexed(self):
        names = {s["name"] for s in skills.on_demand()}

        assert "first-dashboard" in names
        assert "first-dashboard" in skills.as_prompt()

    def test_it_has_a_branch_per_route(self):
        text = _skill_text()

        for route in ("Route 1: Example", "Route 2: Imported file", "Route 3: New database"):
            assert route in text

    def test_it_carries_the_stable_file_reference_rule(self):
        text = _skill_text()

        assert "keeps its stable reference" in text
        assert "Do not change the source" in text
        assert "second source for the same file" in text

    def test_it_carries_the_large_source_guard(self):
        text = _skill_text()

        assert "## Large sources" in text
        assert "1,000,000 rows" in text
        assert "100,000 rows" in text

    def test_every_tool_or_skill_it_names_exists(self):
        named = set(re.findall(r"`([a-z]+(?:_[a-z]+)+|[a-z]+(?:-[a-z]+)+)`", _skill_text()))
        known = set(tools.TOOLS) | {s["name"] for s in skills.packaged()}
        sql_and_yaml = {"try_cast"}

        assert named - sql_and_yaml <= known, named - known - sql_and_yaml


class TestTheDatasets:
    def test_the_file_route_has_ten_messy_files_and_a_bar_of_eight(self):
        dataset = _dataset("first-dashboard")
        files = [p for p in dataset["prompts"] if p["route"] == "file"]

        assert len(files) == 10
        assert dataset["pass_bar"]["file"] == 8

    def test_the_database_route_has_three_schemas_and_a_bar_of_three(self):
        dataset = _dataset("first-dashboard")
        databases = [p for p in dataset["prompts"] if p["route"] == "database"]

        assert len(databases) == 3
        assert dataset["pass_bar"]["database"] == 3

    def test_every_prompt_adds_one_source_and_names_its_dashboard(self):
        for prompt in _dataset("first-dashboard")["prompts"]:
            sources = [s for s in prompt["setup"] if s["type"] == "sources"]
            assert len(sources) == 1, prompt["id"]
            assert prompt["dashboard"] in prompt["prompt"], prompt["id"]
            assert sources[0]["config"]["name"] in prompt["prompt"], prompt["id"]

    def test_each_file_prompt_points_at_the_import_the_seed_builds(self):
        seed = _module("first_dashboard_seed", os.path.join(DATASETS, "first-dashboard", "seed.py"))
        built = {f"data/imports/{version}.duckdb": name for version, name, _ in seed.FILES}

        for prompt in _dataset("first-dashboard")["prompts"]:
            if prompt["route"] != "file":
                continue
            database = prompt["setup"][0]["config"]["database"]
            assert database in built, prompt["id"]
            assert built[database] in prompt["prompt"], prompt["id"]
            assert "file_reference_kept" in prompt["expects"]

    def test_each_database_prompt_points_at_a_database_the_seed_builds(self):
        seed = _module("first_dashboard_seed", os.path.join(DATASETS, "first-dashboard", "seed.py"))
        built = {f"data/databases/{name}.duckdb" for name, _ in seed.DATABASES}

        for prompt in _dataset("first-dashboard")["prompts"]:
            if prompt["route"] == "database":
                assert prompt["setup"][0]["config"]["database"] in built

    def test_the_seed_names_tables_the_way_the_upload_does(self):
        seed = _module("first_dashboard_seed", os.path.join(DATASETS, "first-dashboard", "seed.py"))

        assert seed.table_name("Sales Export (Final).csv") == "Sales_Export__Final_"
        assert seed.table_name("2024 report.csv") == "_2024_report"


class TestTheStarterPrompts:
    def test_the_viewer_offers_exactly_the_scored_example_prompts(self):
        with open(STARTERS) as handle:
            offered = json.load(handle)
        dataset = _dataset("first-dashboard-example")
        scored = [p["prompt"] for p in dataset["prompts"] if p.get("chip")]

        assert offered == {"EV Sales": scored}
        assert len(scored) == 3
        assert dataset["pass_bar"]["example"] == 3

    def test_they_are_offered_on_the_example_they_were_scored_on(self):
        dataset = _dataset("first-dashboard-example")
        with open(os.path.join(ROOT, dataset["project"], "project.visivo.yml")) as handle:
            project = yaml.safe_load(handle)
        with open(STARTERS) as handle:
            offered = json.load(handle)

        assert list(offered) == [project["name"]]


IMPORTED = [
    {
        "type": "sources",
        "config": {"name": "sales", "type": "duckdb", "database": "data/imports/fv-01.duckdb"},
    }
]


def _working_run(**extra):
    run = {
        "dataset": "first-dashboard",
        "prompt_id": "file-01",
        "route": "file",
        "expected_dashboard": "first-sales",
        "expected_dashboard_built": True,
        "final_run": {"left_failed": False},
        "file_reference": {"kept": True, "problems": []},
        "client": {"cost_usd": 1.0, "invalid": False},
        "dashboards": {
            "first-sales": {
                "expected_visuals": 2,
                "desktop": {"plots": 1, "tables": 1, "console_errors": [], "empty_tables": 0},
            }
        },
    }
    run.update(extra)
    return run


class TestFileReference:
    def test_an_untouched_source_is_kept(self, scorecard):
        objects = {"sources": {"sales": dict(IMPORTED[0]["config"])}}

        assert scorecard.file_reference(IMPORTED, objects) == {"kept": True, "problems": []}

    def test_an_absolute_path_to_the_same_file_is_kept(self, scorecard):
        source = dict(IMPORTED[0]["config"], database="/p/data/imports/fv-01.duckdb")

        assert scorecard.file_reference(IMPORTED, {"sources": {"sales": source}})["kept"]

    def test_a_repointed_source_is_not(self, scorecard):
        source = dict(IMPORTED[0]["config"], database="data/sales_copy.duckdb")

        result = scorecard.file_reference(IMPORTED, {"sources": {"sales": source}})

        assert result["problems"] == ["source sales now points at data/sales_copy.duckdb"]

    def test_a_deleted_source_is_not(self, scorecard):
        assert scorecard.file_reference(IMPORTED, {"sources": {}})["problems"] == [
            "source sales is gone"
        ]

    def test_a_changed_type_is_not(self, scorecard):
        source = dict(IMPORTED[0]["config"], type="sqlite")

        result = scorecard.file_reference(IMPORTED, {"sources": {"sales": source}})

        assert result["problems"] == ["source sales changed type to sqlite"]

    def test_a_second_source_on_the_same_file_is_not(self, scorecard):
        objects = {
            "sources": {
                "sales": dict(IMPORTED[0]["config"]),
                "sales_2": dict(IMPORTED[0]["config"], name="sales_2"),
                "other": {"name": "other", "type": "duckdb", "database": "x.duckdb"},
            }
        }

        result = scorecard.file_reference(IMPORTED, objects)

        assert result["problems"] == ["source sales_2 reads the same file as sales"]

    def test_a_setup_without_sources_has_nothing_to_keep(self, scorecard):
        assert scorecard.file_reference([{"type": "models", "config": {}}], None)["kept"]

    def test_a_missing_path_is_compared_as_a_value(self, scorecard):
        source = {"name": "sales", "type": "duckdb"}

        assert not scorecard.file_reference(IMPORTED, {"sources": {"sales": source}})["kept"]


class TestWorking:
    def test_a_built_rendered_kept_run_works(self, scorecard):
        assert scorecard.working(_working_run())

    @pytest.mark.parametrize(
        "change",
        [
            {"expected_dashboard_built": False},
            {"final_run": {"left_failed": True}},
            {"file_reference": {"kept": False}},
            {"dashboards": {}},
        ],
    )
    def test_each_condition_is_required(self, scorecard, change):
        assert not scorecard.working(_working_run(**change))

    def test_the_file_reference_only_counts_on_the_file_route(self, scorecard):
        assert scorecard.working(_working_run(route="database", file_reference=None))

    @pytest.mark.parametrize(
        "desktop",
        [
            {"plots": 1, "tables": 0},
            {"plots": 0, "tables": 0},
            {"plots": 2, "console_errors": ["boom"]},
            {"plots": 2, "empty_tables": 1},
        ],
    )
    def test_every_visual_must_render(self, scorecard, desktop):
        run = _working_run()
        run["dashboards"]["first-sales"]["desktop"] = desktop

        assert not scorecard.working(run)

    def test_only_the_asked_dashboard_counts(self, scorecard):
        run = _working_run()
        run["dashboards"]["scratch"] = {"expected_visuals": 1, "desktop": {"plots": 0}}

        assert scorecard.working(run)

    def test_with_no_name_asked_every_dashboard_counts(self, scorecard):
        run = _working_run(expected_dashboard=None)
        run["dashboards"]["scratch"] = {"expected_visuals": 1, "desktop": {"plots": 0}}

        assert not scorecard.working(run)


class TestPercentile:
    def test_interpolates(self, scorecard):
        assert scorecard.percentile([4, 1, 3, 2], 50) == 2.5
        assert scorecard.percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90) == pytest.approx(9.1)

    def test_ignores_missing_costs(self, scorecard):
        assert scorecard.percentile([None, 2.0], 90) == 2.0

    def test_nothing_is_none(self, scorecard):
        assert scorecard.percentile([None], 50) is None


class TestScore:
    def test_a_route_meets_its_bar_with_credit_percentiles(self, scorecard):
        runs = [
            _working_run(prompt_id="file-01", client={"cost_usd": 1.0}),
            _working_run(prompt_id="file-02", client={"cost_usd": 3.0}),
            _working_run(prompt_id="file-03", expected_dashboard_built=False),
            _working_run(prompt_id="file-04", client={"invalid": True}),
        ]

        (row,) = scorecard.score(runs, {("first-dashboard", "file"): 2})

        assert row["passed"] == ["file-01", "file-02"]
        assert row["failed"] == ["file-03"]
        assert (row["runs"], row["invalid_runs"], row["working_runs"]) == (3, 1, 2)
        assert row["meets_bar"] is True
        assert row["credit_p50"] == 1.0
        assert row["credit_p90"] == pytest.approx(2.6)

    def test_a_prompt_passes_on_half_its_repeats(self, scorecard):
        runs = [_working_run(), _working_run(expected_dashboard_built=False)]

        (row,) = scorecard.score(runs, {("first-dashboard", "file"): 1})

        assert row["passed"] == ["file-01"]

    def test_a_missed_bar_and_a_route_without_one(self, scorecard):
        runs = [
            _working_run(expected_dashboard_built=False),
            _working_run(dataset="taxi", route=None, prompt_id="explore"),
        ]

        rows = scorecard.score(runs, {("first-dashboard", "file"): 1})

        assert [(r["dataset"], r["route"], r["meets_bar"]) for r in rows] == [
            ("first-dashboard", "file", False),
            ("taxi", "all", None),
        ]

    def test_markdown_lists_bars_credit_and_failures(self, scorecard):
        rows = scorecard.score(
            [_working_run(), _working_run(prompt_id="file-02", final_run={"left_failed": True})],
            {("first-dashboard", "file"): 2},
        )
        rows += scorecard.score([_working_run(dataset="taxi", route=None, client={})], {})

        table = scorecard.markdown(rows)

        assert (
            "| first-dashboard | file | 1 of 2 | 2 (missed) | 1 of 2 | $1.00 | $1.00 | file-02 |"
            in table
        )
        assert "| taxi | all | 1 of 1 | – | 1 of 1 | – | – | none |" in table


class TestTheCommand:
    def _write(self, runs_dir, name, summary):
        os.makedirs(runs_dir / name)
        (runs_dir / name / "summary.json").write_text(json.dumps(summary))

    def test_it_reads_the_bar_from_the_dataset_and_exits_on_it(self, scorecard, tmp_path, capsys):
        for index in range(8):
            self._write(tmp_path, f"r{index}", _working_run(prompt_id=f"file-{index:02d}"))

        assert scorecard.main(["--runs", str(tmp_path)]) == 0
        assert "8 of 8 | 8 (met)" in capsys.readouterr().out

        self._write(tmp_path, "r9", _working_run(prompt_id="database-01", route="database"))

        assert scorecard.main(["--runs", str(tmp_path), "--json"]) == 1
        rows = json.loads(capsys.readouterr().out)
        assert {r["route"]: r["meets_bar"] for r in rows} == {"file": True, "database": False}

    def test_a_dataset_without_a_prompts_file_has_no_bar(self, scorecard, tmp_path):
        assert scorecard.pass_bars({"nope"}, str(tmp_path)) == {}


class _FakeServe:
    """Enough of run.Serve for one builtin run that writes nothing."""

    def __init__(self, objects):
        self.objects = objects
        self.seeded = None

    def reset(self):
        return "succeeded"

    def seed(self, setup):
        self.seeded = setup

    def snapshot(self):
        return self.objects

    def tool(self, name, arguments=None):
        return {"latest": {"state": "succeeded"}}

    def http(self, method, path, body=None, timeout=60):
        if path == "/api/agent/":
            return 201, {"id": "s1"}
        if path == "/api/agent/s1/":
            return 200, {"state": "succeeded", "transcript": [], "output": "done"}
        return 200, {"actions": []}


class TestTheRunner:
    def test_sources_are_snapshotted(self, run_module):
        assert "sources" in run_module.OBJECT_TYPES

    def test_a_file_run_records_its_route_and_file_reference(
        self, run_module, tmp_path, monkeypatch
    ):
        monkeypatch.setattr(run_module.time, "sleep", lambda _: None)
        objects = {key: {} for key in run_module.OBJECT_TYPES}
        objects["sources"] = {"sales": dict(IMPORTED[0]["config"], database="elsewhere.duckdb")}
        item = {"id": "file-01", "route": "file", "prompt": "p", "setup": IMPORTED}
        dataset = {"name": "first-dashboard", "description": "d"}

        summary = run_module.run_one(
            _FakeServe(objects), "builtin", item, "sonnet", str(tmp_path), dataset
        )

        assert summary["route"] == "file"
        assert summary["file_reference"]["problems"] == [
            "source sales now points at elsewhere.duckdb"
        ]

    def test_other_routes_carry_no_file_reference(self, run_module, tmp_path, monkeypatch):
        monkeypatch.setattr(run_module.time, "sleep", lambda _: None)
        objects = {key: {} for key in run_module.OBJECT_TYPES}
        item = {"id": "explore", "prompt": "p"}

        summary = run_module.run_one(
            _FakeServe(objects),
            "builtin",
            item,
            "sonnet",
            str(tmp_path),
            {"name": "t", "description": "d"},
        )

        assert summary["route"] is None
        assert "file_reference" not in summary


class TestTheSeed:
    """Builds every fixture into a temporary project: what the eval runs on."""

    @pytest.fixture(scope="class")
    def built(self, tmp_path_factory):
        import duckdb

        seed = _module(
            "first_dashboard_seed_build", os.path.join(DATASETS, "first-dashboard", "seed.py")
        )
        data = tmp_path_factory.mktemp("first-dashboard") / "data"
        seed.DATA = str(data)
        seed.ROOT = str(data.parent)
        seed.main()

        def tables(path):
            with duckdb.connect(str(data / path), read_only=True) as conn:
                return {
                    name: conn.execute(f'select count(*) from "{name}"').fetchone()[0]
                    for (name,) in conn.execute("show tables").fetchall()
                }

        return data, seed, tables

    def test_each_original_is_kept_beside_its_import(self, built):
        data, seed, tables = built

        for version, filename, _ in seed.FILES:
            assert (data / "uploads" / version / filename).is_file()
            assert seed.table_name(filename) in tables(f"imports/{version}.duckdb")

    def test_the_messy_files_import_messy(self, built):
        _, _, tables = built

        assert tables("imports/fv-04.duckdb") == {"store_report": 301}
        assert tables("imports/fv-07.duckdb") == {"web_events_large": 1_200_000}

    def test_the_import_cannot_read_a_file_with_title_lines(self, built):
        """The current importer falls back to UTF-16 and keeps 0 rows. The
        fixture's prompt scores an honest answer, not a dashboard."""
        _, _, tables = built

        assert list(tables("imports/fv-06.duckdb").values()) == [0]

    def test_the_databases_have_their_shapes(self, built):
        _, _, tables = built

        assert set(tables("databases/retail.duckdb")) == {
            "stores",
            "products",
            "customers",
            "orders",
            "order_items",
        }
        assert len(tables("databases/ops_warehouse.duckdb")) == 60
        assert tables("databases/iot_telemetry.duckdb")["readings"] == 3_000_000
