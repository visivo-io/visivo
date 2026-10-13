import os
import json
from tests.factories.model_factories import (
    DashboardFactory,
    ProjectFactory,
    DuckdbSourceFactory,
    SeedFactory,
    SqlModelFactory,
    InsightFactory,
)
from tests.support.utils import temp_folder, temp_yml_file
from visivo.commands.compile_phase import compile_phase
from visivo.commands.utils import create_file_database
from visivo.parsers.file_names import PROJECT_FILE_NAME


def test_compile_model_on_seeded_source():
    output_dir = temp_folder()
    source = DuckdbSourceFactory(
        name="seed_source",
        database=f"{output_dir}/seeded.duckdb",
        seeds=[SeedFactory(table_name="raw", args=["echo", "x,y\n1,2\n3,4\n5,6"])],
    )
    model = SqlModelFactory(name="seeded_model", source="ref(seed_source)", sql="select * from raw")
    insight = InsightFactory(name="seeded_insight", model=model)
    project = ProjectFactory(
        sources=[source],
        models=[model],
        insights=[insight],
    )

    tmp = temp_yml_file(dict=json.loads(project.model_dump_json()), name=PROJECT_FILE_NAME)
    working_dir = os.path.dirname(tmp)

    compile_phase(
        default_source=None,
        working_dir=working_dir,
        output_dir=output_dir,
    )
    # project.json is now generated lazily at `visivo dist` time, not by compile.
    assert "project.json" not in os.listdir(f"{output_dir}")


def test_compile_phase_rejects_table_with_invalid_generated_sql():
    """bug #7 (relocated): a table whose columns compile to invalid SQL now fails
    at COMPILE with one actionable message — not at model construction. The
    model loads (so the server stays up); the CLI fails compile/run/test here."""
    import pytest
    from visivo.models.table import Table
    from visivo.models.models.sql_model import SqlModel

    output_dir = temp_folder()
    source = DuckdbSourceFactory(name="s", database=f"{output_dir}/s.duckdb")
    model = SqlModel(name="i", source="ref(s)", sql="select 1 as sex")
    project = ProjectFactory(
        sources=[source],
        models=[model],
        tables=[Table(name="broken_pivot", columns=['${ref(i).sex} as ""Sex""'])],
        dashboards=[],
    )

    with pytest.raises(ValueError, match="invalid SQL"):
        compile_phase(
            default_source=None,
            working_dir=output_dir,
            output_dir=output_dir,
            no_deprecation_warnings=True,
            project=project,
        )


def test_compile_phase_rejects_table_reading_two_unrelated_sources():
    """VIS-1462 T7a: a column-select / pivot table whose refs span two models
    with no relationship fails at COMPILE with a message naming both sources —
    the viewer would otherwise silently query the first source for the second's
    columns. A single-source table in the same project compiles clean."""
    import pytest
    from visivo.models.table import Table
    from visivo.models.models.sql_model import SqlModel

    output_dir = temp_folder()
    os.makedirs(output_dir, exist_ok=True)
    source = DuckdbSourceFactory(name="s", database=f"{output_dir}/s.duckdb")
    model_a = SqlModel(name="orders", source="ref(s)", sql="select 1 as id, 2 as amount")
    model_b = SqlModel(name="users", source="ref(s)", sql="select 1 as id, 'x' as region")

    def make(tables):
        return ProjectFactory(
            sources=[source], models=[model_a, model_b], tables=tables, dashboards=[]
        )

    compile_phase(
        default_source=None,
        working_dir=output_dir,
        output_dir=output_dir,
        no_deprecation_warnings=True,
        project=make([Table(name="one_source", columns=["${ref(orders).amount} as Amount"])]),
    )

    with pytest.raises(ValueError) as exc_info:
        compile_phase(
            default_source=None,
            working_dir=output_dir,
            output_dir=output_dir,
            no_deprecation_warnings=True,
            project=make(
                [
                    Table(
                        name="two_sources",
                        columns=["${ref(orders).amount}", "${ref(users).region}"],
                    )
                ]
            ),
        )
    message = str(exc_info.value)
    assert "two_sources" in message
    assert "'orders'" in message and "'users'" in message
    assert "no relationship" in message


def test_dashboard_new_fields():
    """Test the new dashboard fields (level, tags, description)"""
    project = ProjectFactory()

    dashboard = DashboardFactory(
        name="Test Dashboard",
        level="L0",
        tags=["critical", "production"],
        description="A critical dashboard for production metrics",
    )
    project.dashboards.append(dashboard)

    assert dashboard.level == "L0"
    assert "critical" in dashboard.tags
    assert "production" in dashboard.tags
    assert dashboard.description == "A critical dashboard for production metrics"
