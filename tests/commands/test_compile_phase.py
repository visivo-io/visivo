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
