"""Tests to verify all model types can have metrics and dimensions."""

import pytest
from visivo.models.models.sql_model import SqlModel
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from visivo.models.project import Project
from tests.factories.model_factories import SourceFactory


def test_sql_model_can_have_metrics_and_dimensions():
    """Test that SqlModel can have metrics and dimensions."""
    source = SourceFactory()
    model = SqlModel(
        name="orders",
        sql="SELECT * FROM orders",
        source=f"ref({source.name})",
        metrics=[
            Metric(name="total_revenue", expression="SUM(amount)"),
        ],
        dimensions=[
            Dimension(name="order_month", expression="DATE_TRUNC('month', order_date)"),
        ],
    )

    assert len(model.metrics) == 1
    assert len(model.dimensions) == 1
    assert model.metrics[0].name == "total_revenue"
    assert model.dimensions[0].name == "order_month"


def test_csv_script_model_can_have_metrics_and_dimensions():
    """Test that CsvScriptModel can have metrics and dimensions."""
    model = CsvScriptModel(
        name="csv_model",
        table_name="data",
        args=["echo", "x,y\n1,2"],
        metrics=[
            Metric(name="total_x", expression="SUM(x)"),
        ],
        dimensions=[
            Dimension(
                name="x_category", expression="CASE WHEN x > 0 THEN 'positive' ELSE 'negative' END"
            ),
        ],
    )

    assert len(model.metrics) == 1
    assert len(model.dimensions) == 1
    assert model.metrics[0].name == "total_x"
    assert model.dimensions[0].name == "x_category"


def test_local_merge_model_can_have_metrics_and_dimensions():
    """Test that LocalMergeModel can have metrics and dimensions."""
    source = SourceFactory()
    base_model = SqlModel(
        name="base",
        sql="SELECT * FROM base_table",
        source=f"ref({source.name})",
    )

    merge_model = LocalMergeModel(
        name="merged",
        sql="SELECT * FROM base",
        models=[f"ref({base_model.name})"],
        metrics=[
            Metric(name="total_count", expression="COUNT(*)"),
        ],
        dimensions=[
            Dimension(name="category", expression="UPPER(type)"),
        ],
    )

    assert len(merge_model.metrics) == 1
    assert len(merge_model.dimensions) == 1
    assert merge_model.metrics[0].name == "total_count"
    assert merge_model.dimensions[0].name == "category"


def test_all_model_types_validate_nested_metrics():
    """Test that all model types validate nested metrics cannot use ref() syntax."""
    source = SourceFactory()

    # Test SqlModel
    with pytest.raises(ValueError) as exc_info:
        SqlModel(
            name="sql_model",
            sql="SELECT * FROM table",
            source=f"ref({source.name})",
            metrics=[
                Metric(name="bad_metric", expression="${ref(other).field}"),
            ],
        )
    assert "cannot use ref() syntax" in str(exc_info.value)

    # Test CsvScriptModel
    with pytest.raises(ValueError) as exc_info:
        CsvScriptModel(
            name="csv_model",
            table_name="data",
            args=["echo", "x,y\n1,2"],
            metrics=[
                Metric(name="bad_metric", expression="${ref(other).field}"),
            ],
        )
    assert "cannot use ref() syntax" in str(exc_info.value)

    # Test LocalMergeModel
    with pytest.raises(ValueError) as exc_info:
        base_model = SqlModel(
            name="base",
            sql="SELECT * FROM base_table",
            source=f"ref({source.name})",
        )
        LocalMergeModel(
            name="merged",
            sql="SELECT * FROM base",
            models=[f"ref({base_model.name})"],
            metrics=[
                Metric(name="bad_metric", expression="${ref(other).field}"),
            ],
        )
    assert "cannot use ref() syntax" in str(exc_info.value)


def test_all_model_types_in_project_dag():
    """Test that metrics and dimensions from all model types appear in project DAG."""
    source = SourceFactory()

    sql_model = SqlModel(
        name="sql_model",
        sql="SELECT * FROM table",
        source=f"ref({source.name})",
        metrics=[Metric(name="sql_metric", expression="COUNT(*)")],
    )

    csv_model = CsvScriptModel(
        name="csv_model",
        table_name="data",
        args=["echo", "x,y\n1,2"],
        dimensions=[Dimension(name="csv_dim", expression="x * 2")],
    )

    merge_model = LocalMergeModel(
        name="merge_model",
        sql="SELECT * FROM sql_model",
        models=["ref(sql_model)"],
        metrics=[Metric(name="merge_metric", expression="SUM(value)")],
    )

    project = Project(
        name="test_project",
        sources=[source],
        models=[sql_model, csv_model, merge_model],
        dashboards=[],
    )

    dag = project.dag()

    # Verify all metrics and dimensions are in the DAG
    from visivo.models.dag import all_descendants_of_type

    all_metrics = all_descendants_of_type(type=Metric, dag=dag)
    all_dimensions = all_descendants_of_type(type=Dimension, dag=dag)

    metric_names = {m.name for m in all_metrics}
    dimension_names = {d.name for d in all_dimensions}

    assert "sql_metric" in metric_names
    assert "merge_metric" in metric_names
    assert "csv_dim" in dimension_names

    # Verify edges exist (metrics/dimensions point to their parent models)
    assert dag.has_edge(sql_model.metrics[0], sql_model)
    assert dag.has_edge(csv_model.dimensions[0], csv_model)
    assert dag.has_edge(merge_model.metrics[0], merge_model)
