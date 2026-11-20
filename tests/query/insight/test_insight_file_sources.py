"""An insight on a file source (CSV, Excel) builds: those sources have no
``db_schema`` or ``database`` field."""

import json
import os

import pytest

from visivo.models.insight import Insight
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.models.props.insight_props import InsightProps
from visivo.models.sources.csv_source import CSVFileSource
from visivo.models.sources.excel_source import ExcelFileSource


@pytest.mark.parametrize(
    "source",
    [
        CSVFileSource(name="gigs_file", type="csv", file="files/gigs.csv"),
        ExcelFileSource(name="gigs_file", type="xls", file="files/gigs.xlsx"),
    ],
)
def test_an_insight_on_a_file_source_builds(tmpdir, source):
    model = SqlModel(name="gigs", sql="SELECT * FROM gigs_file", source="ref(gigs_file)")
    insight = Insight(
        name="gigs_count",
        props=InsightProps(type="indicator", value="?{count(${ref(gigs).title})}"),
    )
    project = Project(name="p", sources=[source], models=[model], insights=[insight], dashboards=[])
    schema_dir = os.path.join(str(tmpdir), "schemas")
    os.makedirs(schema_dir)
    with open(os.path.join(schema_dir, "gigs.json"), "w") as f:
        json.dump({model.name_hash(): {"title": "VARCHAR"}}, f)
    from visivo.query.insight.insight_query_builder import InsightQueryBuilder

    builder = InsightQueryBuilder(insight, project.dag(), str(tmpdir))
    builder.resolve()
    info = builder.build()

    assert "count" in (info.pre_query or info.post_query).lower()
