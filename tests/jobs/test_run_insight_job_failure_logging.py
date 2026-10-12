"""Failure-path details of run_insight_job.action: the failed pre_query is
logged to a file and, when the source reports a location, it is surfaced in
the failure message."""

import json

import pytest

from tests.factories.model_factories import SourceFactory
from visivo.jobs.run_insight_job import _get_source, action
from visivo.models.insight import Insight
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.models.props.insight_props import InsightProps
from visivo.models.sources.sqlite_source import SqliteSource


def _project(tmpdir, columns):
    source = SourceFactory()
    model = SqlModel(name="m", sql="SELECT 1 as a", source=f"ref({source.name})")
    insight = Insight(name="i", props=InsightProps(type="scatter", x="?{${ref(m).a}}"))
    project = Project(name="p", sources=[source], models=[model], insights=[insight], dashboards=[])
    schema_dir = tmpdir.mkdir("main").mkdir("schemas")
    schema_dir.join("m.json").write(json.dumps({model.name_hash(): columns}))
    return project.dag(), insight


def test_failed_query_is_saved_to_a_file_and_referenced_in_the_message(tmpdir, monkeypatch):
    dag, insight = _project(tmpdir, {"a": "INTEGER"})

    def boom(self, sql):
        raise RuntimeError("no such column: zzz")

    monkeypatch.setattr(SqliteSource, "read_sql", boom)

    result = action(insight, dag, str(tmpdir))

    assert result.success is False
    assert "query saved to:" in result.message
    saved = tmpdir.join("logs", "failed_queries").listdir()
    assert len(saved) == 1
    assert "no such column: zzz" in saved[0].read()
    assert result.diagnostic.code == "query_execution_failed"


def test_error_location_is_surfaced_when_the_source_reports_one(tmpdir, monkeypatch):
    dag, insight = _project(tmpdir, {"a": "INTEGER"})

    def boom(self, sql):
        raise RuntimeError("Syntax error at [3:7]")

    monkeypatch.setattr(SqliteSource, "read_sql", boom)

    result = action(insight, dag, str(tmpdir))

    assert result.success is False
    assert "at line 3, column 7" in result.message


def test_get_source_is_none_for_a_model_less_insight():
    insight = Insight(name="lonely", props=InsightProps(type="scatter", x=[1]))
    dag = Project(name="p", insights=[insight], dashboards=[]).dag()
    assert _get_source(insight, dag, "unused") is None
