from visivo.query.insight_tokenizer import InsightTokenizer
from visivo.models.insight import Insight
from visivo.models.base.project_dag import ProjectDag

from tests.factories.model_factories import SnowflakeSourceFactory, SqlModelFactory, ProjectFactory
import pytest


def test_insight_tokenizer_basic():
    """Test basic insight tokenization without interactions"""
    # Create a simple insight
    insight_data = {
        "name": "test_insight",
        "model": {"sql": "SELECT * FROM test_table"},
        "props": {"type": "scatter", "x": "?{date}", "y": "?{amount}"},
    }

    insight = Insight(**insight_data)
    model = SqlModelFactory(sql="SELECT * FROM test_table")
    source = SnowflakeSourceFactory()

    # Create a mock DAG with a Project as root
    project = ProjectFactory()
    dag = ProjectDag()
    dag.add_node(project)
    dag.add_node(source)
    dag.add_node(model)
    dag.add_node(insight)
    dag.add_edge(project, source)
    dag.add_edge(source, model)
    dag.add_edge(model, insight)

    tokenizer = InsightTokenizer(insight=insight, model=model, source=source, dag=dag)
    tokenized = tokenizer.tokenize()

    # Basic checks
    assert tokenized.name == "test_insight"
    assert tokenized.source == "source"
    assert tokenized.source_type == "snowflake"
    assert "props.x" in tokenized.select_items
    assert "props.y" in tokenized.select_items
    assert tokenized.select_items["props.x"] == "date"
    assert tokenized.select_items["props.y"] == "amount"


def test_insight_tokenizer_with_additional_props():
    """Test insight tokenization with additional props"""
    insight_data = {
        "name": "test_insight",
        "model": {"sql": "SELECT * FROM test_table"},
        "props": {"type": "scatter", "x": "?{date}", "y": "?{sum(amount)}", "text": "?{region}"},
    }

    insight = Insight(**insight_data)
    model = SqlModelFactory(sql="SELECT * FROM test_table")
    source = SnowflakeSourceFactory()

    # Create a mock DAG with a Project as root
    project = ProjectFactory()
    dag = ProjectDag()
    dag.add_node(project)
    dag.add_node(source)
    dag.add_node(model)
    dag.add_node(insight)
    dag.add_edge(project, source)
    dag.add_edge(source, model)
    dag.add_edge(model, insight)

    tokenizer = InsightTokenizer(insight=insight, model=model, source=source, dag=dag)
    tokenized = tokenizer.tokenize()

    # Check that columns support has been removed
    assert not hasattr(tokenized, "column_items")

    # Check props
    assert "props.x" in tokenized.select_items
    assert "props.y" in tokenized.select_items
    assert "props.text" in tokenized.select_items


def test_insight_tokenizer_with_interactions():
    """Test insight tokenization with interactions"""
    insight_data = {
        "name": "test_insight",
        "model": {"sql": "SELECT * FROM test_table"},
        "props": {"type": "scatter", "x": "?{date}", "y": "?{sum(amount)}"},
        "interactions": [
            {"filter": "?{region = '${ref(region_select).value}'}"},
            {"split": "?{category}"},
        ],
    }

    insight = Insight(**insight_data)
    model = SqlModelFactory(sql="SELECT * FROM test_table")
    source = SnowflakeSourceFactory()

    # Create a mock DAG with a Project as root
    project = ProjectFactory()
    dag = ProjectDag()
    dag.add_node(project)
    dag.add_node(source)
    dag.add_node(model)
    dag.add_node(insight)
    dag.add_edge(project, source)
    dag.add_edge(source, model)
    dag.add_edge(model, insight)

    tokenizer = InsightTokenizer(insight=insight, model=model, source=source, dag=dag)
    tokenized = tokenizer.tokenize()

    # Check interactions are serialized
    assert len(tokenized.interactions) >= 1

    # Check split column is identified
    assert tokenized.split_column == "category"


def test_insight_tokenizer_aggregation_detection():
    """Test that aggregation functions are properly detected"""
    insight_data = {
        "name": "test_insight",
        "model": {"sql": "SELECT * FROM test_table"},
        "props": {
            "type": "scatter",
            "x": "?{date}",
            "y": "?{sum(amount)}",  # This should trigger groupby
        },
    }

    insight = Insight(**insight_data)
    model = SqlModelFactory(sql="SELECT * FROM test_table")
    source = SnowflakeSourceFactory()

    # Create a mock DAG with a Project as root
    project = ProjectFactory()
    dag = ProjectDag()
    dag.add_node(project)
    dag.add_node(source)
    dag.add_node(model)
    dag.add_node(insight)
    dag.add_edge(project, source)
    dag.add_edge(source, model)
    dag.add_edge(model, insight)

    tokenizer = InsightTokenizer(insight=insight, model=model, source=source, dag=dag)
    tokenized = tokenizer.tokenize()

    # Should require GROUP BY due to aggregation
    assert tokenized.requires_groupby == True

    # Pre-query should contain GROUP BY
    assert "GROUP BY" in tokenized.pre_query


def test_insight_tokenizer_pre_post_query_generation():
    """Test that pre and post queries are generated correctly"""
    insight_data = {
        "name": "test_insight",
        "model": {"sql": "SELECT * FROM test_table"},
        "props": {"type": "indicator", "value": "?{sum(amount)}"},
        "interactions": [{"filter": "?{region = '${ref(region_select).value}'}"}],
    }

    insight = Insight(**insight_data)
    model = SqlModelFactory(sql="SELECT * FROM test_table")
    source = SnowflakeSourceFactory()

    # Create a mock DAG with a Project as root
    project = ProjectFactory()
    dag = ProjectDag()
    dag.add_node(project)
    dag.add_node(source)
    dag.add_node(model)
    dag.add_node(insight)
    dag.add_edge(project, source)
    dag.add_edge(source, model)
    dag.add_edge(model, insight)

    tokenizer = InsightTokenizer(insight=insight, model=model, source=source, dag=dag)
    tokenized = tokenizer.tokenize()

    # Pre-query should include all necessary columns
    assert "SUM(amount)" in tokenized.pre_query
    assert "region" in tokenized.pre_query

    # Post-query should be a simple SELECT with potential filters
    assert tokenized.post_query.startswith("SELECT * FROM test_table")
