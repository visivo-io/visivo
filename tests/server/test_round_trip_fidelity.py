"""VIS-1198: the fidelity gate for anything that writes a customer's repo.

Runs the real projects in `test-projects/` through parse → write → re-parse and
asserts nothing is lost, plus adversarial fixtures for the shapes most likely to
break a YAML round trip.
"""

import os

import pytest

from tests.support.round_trip import (
    assert_round_trips,
    comparable,
    copy_project,
    parse_project,
)

TEST_PROJECTS = os.path.join(os.path.dirname(__file__), "..", "..", "test-projects")

# Projects that parse without external services. `dbt` needs a compiled dbt
# target and `demo`/`homepage-assets` reach for data that is not in the repo, so
# they are covered by the integration suite rather than here.
ROUND_TRIP_PROJECTS = [
    "integration",
    "complex-project",
    "docs-interactivity",
    "explorer-publish-e2e",
    "test",
]


@pytest.mark.parametrize("project_name", ROUND_TRIP_PROJECTS)
def test_a_real_project_survives_being_rewritten(project_name, tmp_path):
    source = os.path.join(TEST_PROJECTS, project_name)
    if not os.path.exists(os.path.join(source, "project.visivo.yml")):
        pytest.skip(f"{project_name} has no project file")

    working_dir = copy_project(source, tmp_path / project_name)

    assert_round_trips(working_dir)


def _write(tmp_path, name, text):
    (tmp_path / name).write_text(text)
    return str(tmp_path)


class TestAdversarialShapes:
    """The shapes a YAML round trip is most likely to mangle."""

    def test_multi_file_includes(self, tmp_path):
        (tmp_path / "models.visivo.yml").write_text(
            "models:\n  - name: orders\n    sql: SELECT 1 as x\n    source: ${ref(db)}\n"
        )
        working_dir = _write(
            tmp_path,
            "project.visivo.yml",
            "name: p\n"
            "includes:\n"
            "  - path: models.visivo.yml\n"
            "sources:\n"
            "  - name: db\n    type: duckdb\n    database: local.duckdb\n",
        )

        assert_round_trips(working_dir)

    def test_non_ascii_and_quoted_scalars(self, tmp_path):
        working_dir = _write(
            tmp_path,
            "project.visivo.yml",
            "name: p\n"
            "sources:\n"
            "  - name: db\n    type: duckdb\n    database: local.duckdb\n"
            "models:\n"
            "  - name: cafe_orders\n"
            "    sql: SELECT '¿qué?' as q, 'naïve' as n\n"
            "    source: ${ref(db)}\n"
            "metrics:\n"
            "  - name: total\n"
            "    expression: sum(${ref(cafe_orders).q})\n"
            '    description: "quoted: with colon — em dash, ünïcode"\n',
        )

        assert_round_trips(working_dir)

    def test_multiline_sql_block_scalar(self, tmp_path):
        working_dir = _write(
            tmp_path,
            "project.visivo.yml",
            "name: p\n"
            "sources:\n"
            "  - name: db\n    type: duckdb\n    database: local.duckdb\n"
            "models:\n"
            "  - name: m\n"
            "    source: ${ref(db)}\n"
            "    sql: |\n"
            "      SELECT 1 as x\n"
            "      FROM t\n"
            "      WHERE y = 2\n",
        )

        assert_round_trips(working_dir)

    def test_model_scoped_metrics_and_dimensions(self, tmp_path):
        """Nested fields are surfaced at top level by the assembler, which is a
        known asymmetry — the round trip must still put them back nested."""
        working_dir = _write(
            tmp_path,
            "project.visivo.yml",
            "name: p\n"
            "sources:\n"
            "  - name: db\n    type: duckdb\n    database: local.duckdb\n"
            "models:\n"
            "  - name: orders\n"
            "    source: ${ref(db)}\n"
            "    sql: SELECT 1 as amount, 'x' as region\n"
            "    metrics:\n"
            "      - name: total\n        expression: sum(amount)\n"
            "    dimensions:\n"
            "      - name: region\n        expression: region\n",
        )

        assert_round_trips(working_dir)

    def test_comments_in_awkward_positions(self, tmp_path):
        working_dir = _write(
            tmp_path,
            "project.visivo.yml",
            "# leading\n"
            "name: p  # trailing on a scalar\n"
            "sources:\n"
            "  # before an item\n"
            "  - name: db\n"
            "    type: duckdb  # trailing on a nested key\n"
            "    database: local.duckdb\n"
            "# dangling at the end\n",
        )

        assert_round_trips(working_dir)
        assert "# leading" in (tmp_path / "project.visivo.yml").read_text()

    def test_an_empty_project_is_not_a_crash(self, tmp_path):
        working_dir = _write(tmp_path, "project.visivo.yml", "name: p\n")

        assert_round_trips(working_dir)


class TestTheHarnessItself:
    """A harness that cannot fail is worse than no harness."""

    def test_it_notices_a_dropped_object(self, tmp_path):
        working_dir = _write(
            tmp_path,
            "project.visivo.yml",
            "name: p\n" "sources:\n" "  - name: db\n    type: duckdb\n    database: local.duckdb\n",
        )
        before = comparable(parse_project(working_dir))

        (tmp_path / "project.visivo.yml").write_text("name: p\n")
        after = comparable(parse_project(working_dir))

        assert set(before) - set(after) == {"db"}

    def test_it_notices_a_changed_value(self, tmp_path):
        working_dir = _write(
            tmp_path,
            "project.visivo.yml",
            "name: p\n" "sources:\n" "  - name: db\n    type: duckdb\n    database: local.duckdb\n",
        )
        before = comparable(parse_project(working_dir))

        (tmp_path / "project.visivo.yml").write_text(
            "name: p\n" "sources:\n" "  - name: db\n    type: duckdb\n    database: OTHER.duckdb\n"
        )
        after = comparable(parse_project(working_dir))

        assert before["db"] != after["db"]
