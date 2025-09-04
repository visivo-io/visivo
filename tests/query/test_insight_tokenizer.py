from visivo.query.insight_tokenizer import InsightTokenizer
from visivo.models.insight import Insight

from tests.factories.model_factories import SnowflakeSourceFactory, SqlModelFactory
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

    tokenizer = InsightTokenizer(insight=insight, model=model, source=source)
    tokenized = tokenizer.tokenize()

    # Basic checks
    assert tokenized.name == "test_insight"
    assert tokenized.source == "source"
    assert tokenized.source_type == "snowflake"
    assert "props.x" in tokenized.select_items
    assert "props.y" in tokenized.select_items
    assert tokenized.select_items["props.x"] == "date"
    assert tokenized.select_items["props.y"] == "amount"


def test_insight_tokenizer_with_columns():
    """Test insight tokenization with explicit columns"""
    insight_data = {
        "name": "test_insight",
        "model": {"sql": "SELECT * FROM test_table"},
        "columns": {"region": "?{region}", "category": "?{category}"},
        "props": {"type": "scatter", "x": "?{date}", "y": "?{sum(amount)}"},
    }

    insight = Insight(**insight_data)
    model = SqlModelFactory(sql="SELECT * FROM test_table")
    source = SnowflakeSourceFactory()

    tokenizer = InsightTokenizer(insight=insight, model=model, source=source)
    tokenized = tokenizer.tokenize()

    # Check columns are included
    assert "columns.region" in tokenized.column_items
    assert "columns.category" in tokenized.column_items
    assert tokenized.column_items["columns.region"] == "region"
    assert tokenized.column_items["columns.category"] == "category"

    # Check props
    assert "props.x" in tokenized.select_items
    assert "props.y" in tokenized.select_items


def test_insight_tokenizer_with_interactions():
    """Test insight tokenization with interactions"""
    insight_data = {
        "name": "test_insight",
        "model": {"sql": "SELECT * FROM test_table"},
        "columns": {"region": "?{region}"},
        "props": {"type": "scatter", "x": "?{date}", "y": "?{sum(amount)}"},
        "interactions": [
            {"filter": "?{region = '${ref(region_select).value}'}"},
            {"split": "?{category}"},
        ],
    }

    insight = Insight(**insight_data)
    model = SqlModelFactory(sql="SELECT * FROM test_table")
    source = SnowflakeSourceFactory()

    tokenizer = InsightTokenizer(insight=insight, model=model, source=source)
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

    tokenizer = InsightTokenizer(insight=insight, model=model, source=source)
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
        "columns": {"region": "?{region}"},
        "props": {"type": "indicator", "value": "?{sum(amount)}"},
        "interactions": [{"filter": "?{region = '${ref(region_select).value}'}"}],
    }

    insight = Insight(**insight_data)
    model = SqlModelFactory(sql="SELECT * FROM test_table")
    source = SnowflakeSourceFactory()

    tokenizer = InsightTokenizer(insight=insight, model=model, source=source)
    tokenized = tokenizer.tokenize()

    # Pre-query should include all necessary columns
    assert "sum(amount)" in tokenized.pre_query
    assert "region" in tokenized.pre_query
    assert "FROM (SELECT * FROM test_table) as base_model" in tokenized.pre_query

    # Post-query should be a simple SELECT with potential filters
    assert tokenized.post_query.startswith("SELECT * FROM test_table")
