import os

from tests.factories.model_factories import (
    InsightFactory,
    ProjectFactory,
    SingleSelectInputFactory,
    SqlModelFactory,
)
from tests.support.utils import temp_folder
from visivo.commands.sweep_artifacts import find_orphaned_artifacts, sweep_orphaned_artifacts
from visivo.models.base.named_model import alpha_hash


def _run_dir(**dirs):
    """A run directory holding `{subdir: [filenames]}`."""
    root = temp_folder()
    for subdir, filenames in dirs.items():
        path = os.path.join(root, subdir)
        os.makedirs(path, exist_ok=True)
        for filename in filenames:
            with open(os.path.join(path, filename), "w") as f:
                f.write("{}")
    return root


def _project(**kwargs):
    """A project with the noisy defaults cleared, so a test declares exactly
    the objects it means to."""
    defaults = {"insights": [], "charts": [], "dashboards": []}
    defaults.update(kwargs)
    return ProjectFactory(**defaults)


class TestFindOrphanedArtifacts:
    """The residue that made `visivo dist` ship every object twice.

    Before VIS-1128 artifacts were named `alpha_hash(name)`; now they are
    `<name>`. A run only ever adds, so both generations sit in the directory and
    anything that globs it sees each object once per naming scheme.
    """

    def test_the_pre_vis_1128_hashed_artifact_is_residue(self):
        project = _project(insights=[InsightFactory(name="station-bubbles")])
        run_dir = _run_dir(
            insights=[
                "station-bubbles.json",
                f"{alpha_hash('station-bubbles')}.json",
            ]
        )

        orphans = find_orphaned_artifacts(project, run_dir)

        assert [os.path.basename(o) for o in orphans] == [f"{alpha_hash('station-bubbles')}.json"]

    def test_an_artifact_left_by_a_rename_is_residue(self):
        project = _project(insights=[InsightFactory(name="revenue_by_month")])
        run_dir = _run_dir(insights=["revenue_by_month.json", "revenue.json"])

        assert [os.path.basename(o) for o in find_orphaned_artifacts(project, run_dir)] == [
            "revenue.json"
        ]

    def test_a_live_object_is_never_residue(self):
        project = _project(
            insights=[InsightFactory(name="a"), InsightFactory(name="b")],
            models=[SqlModelFactory(name="orders")],
        )
        run_dir = _run_dir(insights=["a.json", "a.parquet", "b.json"], models=["orders.parquet"])

        assert find_orphaned_artifacts(project, run_dir) == []


class TestObjectsDefinedInline:
    """An object does not have to be top-level.

    The integration project defines `double-simple-line` inline inside a chart,
    inside a dashboard item. It is a real insight with a real artifact — and
    reading `project.insights` (the TOP-LEVEL list) called it residue and
    deleted it. CI caught that; no unit fixture here had a project shaped that
    way, because they all declared their objects at the top level.

    Membership comes from the DAG, which is the same flattening `child_items()`
    feeds and the same thing the rest of the system means by "in the project".
    """

    def _project_with_a_chart_nested_insight(self):
        from tests.factories.model_factories import (
            ChartFactory,
            DashboardFactory,
            ItemFactory,
            RowFactory,
        )

        model = SqlModelFactory(name="model")
        nested = InsightFactory(name="double-simple-line", model=model)
        chart = ChartFactory(name="fibonacci-times-2", insights=[nested])
        dashboard = DashboardFactory(
            name="dash", rows=[RowFactory(items=[ItemFactory(chart=chart)])]
        )
        # Deliberately NOT passed as `insights=[...]` — that is the whole point.
        return ProjectFactory(models=[model], charts=[], insights=[], dashboards=[dashboard])

    def test_an_insight_declared_inside_a_chart_is_not_residue(self):
        project = self._project_with_a_chart_nested_insight()
        run_dir = _run_dir(insights=["double-simple-line.json"])

        assert find_orphaned_artifacts(project, run_dir) == []

    def test_residue_beside_an_inline_insight_still_goes(self):
        project = self._project_with_a_chart_nested_insight()
        run_dir = _run_dir(
            insights=[
                "double-simple-line.json",
                f"{alpha_hash('double-simple-line')}.json",
            ]
        )

        assert [os.path.basename(o) for o in find_orphaned_artifacts(project, run_dir)] == [
            f"{alpha_hash('double-simple-line')}.json"
        ]


class TestInputSuffixes:
    """An input writes `<name>.json` beside `<name>_<key>.parquet`, so a stem
    does not always equal the object's name."""

    def test_the_options_parquet_belongs_to_its_input(self):
        project = _project(inputs=[SingleSelectInputFactory(name="cuisine-select")])
        run_dir = _run_dir(
            inputs=["cuisine-select.json", "cuisine-select_options.parquet"],
        )

        assert find_orphaned_artifacts(project, run_dir) == []

    def test_a_suffixed_file_whose_input_is_gone_is_residue(self):
        project = _project(inputs=[SingleSelectInputFactory(name="cuisine-select")])
        run_dir = _run_dir(
            inputs=[
                "cuisine-select.json",
                f"{alpha_hash('cuisine-select')}_options.parquet",
            ]
        )

        assert [os.path.basename(o) for o in find_orphaned_artifacts(project, run_dir)] == [
            f"{alpha_hash('cuisine-select')}_options.parquet"
        ]

    def test_an_ambiguous_suffix_keeps_the_file(self):
        """`region_totals_options.parquet` could be a deleted `region_totals`
        input's options, OR a live `region` input's `totals_options` key. The
        `<name>_<key>` shape cannot tell them apart.

        So it is KEPT. When the rule is ambiguous the safe error is leaving a
        stale file behind; the unsafe one is deleting data on a guess.
        """
        project = _project(inputs=[SingleSelectInputFactory(name="region")])
        run_dir = _run_dir(inputs=["region.json", "region_totals_options.parquet"])

        assert find_orphaned_artifacts(project, run_dir) == []

    def test_a_suffixed_file_matching_no_input_at_all_is_residue(self):
        """No such ambiguity here — nothing in the project is a prefix of it."""
        project = _project(inputs=[SingleSelectInputFactory(name="region")])
        run_dir = _run_dir(inputs=["region.json", "cuisine_options.parquet"])

        assert [os.path.basename(o) for o in find_orphaned_artifacts(project, run_dir)] == [
            "cuisine_options.parquet"
        ]


class TestSafety:
    def test_an_empty_collection_sweeps_nothing(self):
        """A project that never had insights looks identical to one whose parse
        dropped them. Deleting the directory's contents on that basis would
        turn a parse problem into data loss."""
        project = _project(insights=[])
        run_dir = _run_dir(insights=["something.json", "another.json"])

        assert find_orphaned_artifacts(project, run_dir) == []

    def test_untracked_directories_are_left_alone(self):
        """`files/` (pre-VIS-1128 parquet) and the schema caches are not
        per-object artifacts; sweeping them is a separate judgement."""
        project = _project(insights=[InsightFactory(name="a")])
        run_dir = _run_dir(
            insights=["a.json"],
            files=["mfvvjxtzogiwfwkjczyjvkxbrjypa.parquet"],
            schemas=["nyc-db.json"],
        )

        assert find_orphaned_artifacts(project, run_dir) == []

    def test_a_missing_run_dir_is_not_an_error(self):
        assert find_orphaned_artifacts(_project(), "does/not/exist") == []
        assert find_orphaned_artifacts(None, None) == []

    def test_subdirectories_are_never_removed(self):
        project = _project(insights=[InsightFactory(name="a")])
        run_dir = _run_dir(insights=["a.json"])
        nested = os.path.join(run_dir, "insights", "orphan_dir")
        os.makedirs(nested, exist_ok=True)

        assert find_orphaned_artifacts(project, run_dir) == []
        assert os.path.isdir(nested)


class TestSweep:
    def test_it_removes_exactly_what_it_reported(self):
        project = _project(insights=[InsightFactory(name="keep")])
        run_dir = _run_dir(insights=["keep.json", "keep.parquet", "drop.json", "drop.parquet"])

        removed = sweep_orphaned_artifacts(project, run_dir)

        assert sorted(os.path.basename(r) for r in removed) == ["drop.json", "drop.parquet"]
        remaining = sorted(os.listdir(os.path.join(run_dir, "insights")))
        assert remaining == ["keep.json", "keep.parquet"]

    def test_nothing_to_do_is_not_an_error(self):
        project = _project(insights=[InsightFactory(name="a")])
        run_dir = _run_dir(insights=["a.json"])

        assert sweep_orphaned_artifacts(project, run_dir) == []
