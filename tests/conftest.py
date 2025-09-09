"""
Shared pytest fixtures for the Visivo test suite.

This module provides reusable fixtures that reduce mock setup duplication across tests.
All fixtures follow pytest best practices and use factory_boy patterns from test_utils.
"""

import pytest
from unittest.mock import Mock, MagicMock, patch
from pathlib import Path
import tempfile

# Import factory_boy factories
from tests.factories.model_factories import (
    SourceFactory,
    SnowflakeSourceFactory,
    BigQuerySourceFactory,
    RedshiftSourceFactory,
    SqlModelFactory,
    CsvScriptModelFactory,
    LocalMergeModelFactory,
    MetricFactory,
    DimensionFactory,
    TraceFactory,
    ChartFactory,
    TableFactory,
    DashboardFactory,
    ProjectFactory,
    ScatterTracePropsFactory,
    SurfaceTracePropsFactory,
)

# Import model classes for type hints and mock specs
from visivo.models.sources.postgresql_source import PostgresqlSource
from visivo.models.sources.snowflake_source import SnowflakeSource
from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.models.metric import Metric
from visivo.models.dimension import Dimension
from visivo.models.trace import Trace
from visivo.models.chart import Chart
from visivo.models.dashboard import Dashboard
from visivo.models.base.project_dag import ProjectDag


# ====================
# Source Fixtures
# ====================


@pytest.fixture
def mock_postgresql_source():
    """
    Create a mock PostgreSQL source with common configurations.

    Returns:
        Mock: A mock PostgreSQL source object
    """
    source = Mock(spec=PostgresqlSource)
    source.name = "postgres_test"
    source.type = "postgresql"
    source.database = "test_db"
    source.host = "localhost"
    source.port = 5432
    source.username = "test_user"
    source.password = "test_pass"
    source.schema = "public"
    source.connection_pool_size = 1

    # Mock connection methods
    source.get_connection = Mock()
    source.get_dialect = Mock(return_value="postgresql+psycopg2")
    source.list_databases = Mock(return_value=["test_db", "postgres"])
    source.introspect = Mock(
        return_value={
            "schemas": ["public", "test_schema"],
            "tables": {
                "public": ["users", "orders", "products"],
                "test_schema": ["metrics", "dimensions"],
            },
        }
    )

    return source


@pytest.fixture
def mock_snowflake_source():
    """
    Create a mock Snowflake source with common configurations.

    Returns:
        Mock: A mock Snowflake source object
    """
    source = SnowflakeSourceFactory.build()

    # Add mock methods
    mock_source = Mock(spec=SnowflakeSource, wraps=source)
    mock_source.name = source.name
    mock_source.type = "snowflake"
    mock_source.database = source.database
    mock_source.account = "test_account"
    mock_source.warehouse = "COMPUTE_WH"
    mock_source.username = "test_user"
    mock_source.password = "test_pass"

    mock_source.get_connection = Mock()
    mock_source.introspect = Mock(
        return_value={
            "schemas": ["PUBLIC", "STAGING"],
            "tables": {"PUBLIC": ["CUSTOMERS", "TRANSACTIONS"], "STAGING": ["RAW_DATA"]},
        }
    )

    return mock_source


@pytest.fixture
def mock_duckdb_source():
    """
    Create a mock DuckDB source with common configurations.

    Returns:
        Mock: A mock DuckDB source object
    """
    source = Mock(spec=DuckdbSource)
    source.name = "duckdb_test"
    source.type = "duckdb"
    source.database = ":memory:"  # In-memory database for testing
    source.attachments = []
    source.connection_pool_size = 1

    # Mock connection methods
    source.get_connection = Mock()
    source.get_dialect = Mock(return_value="duckdb")
    source.introspect = Mock(
        return_value={"schemas": ["main"], "tables": {"main": ["analytics", "events", "users"]}}
    )

    return source


@pytest.fixture
def mock_sqlite_source(tmp_path):
    """
    Create a mock SQLite source with a temporary database file.

    Args:
        tmp_path: pytest's tmp_path fixture for temporary files

    Returns:
        SqliteSource: A real SQLite source with a temporary database
    """
    db_path = tmp_path / "test.sqlite"
    source = SourceFactory.build(name="sqlite_test", database=str(db_path), type="sqlite")
    return source


# ====================
# Model Fixtures
# ====================


@pytest.fixture
def mock_sql_model():
    """
    Create a mock SQL model with common configurations.

    Returns:
        SqlModel: A SQL model with standard configuration
    """
    return SqlModelFactory.build(
        name="test_model",
        sql="SELECT id, name, value FROM test_table WHERE active = true",
        source="ref(test_source)",
    )


@pytest.fixture
def mock_sql_model_with_metrics():
    """
    Create a mock SQL model that includes metric definitions.

    Returns:
        Mock: A SQL model with attached metrics
    """
    model = Mock(spec=SqlModel)
    model.name = "orders_model"
    model.sql = "SELECT * FROM orders"
    model.source = "ref(postgres_test)"

    # Add metrics to the model
    model.metrics = [
        MetricFactory.build(
            name="total_revenue", expression="SUM(amount)", description="Total revenue from orders"
        ),
        MetricFactory.build(
            name="order_count", expression="COUNT(*)", description="Number of orders"
        ),
    ]

    return model


@pytest.fixture
def mock_csv_script_model():
    """
    Create a mock CSV script model.

    Returns:
        CsvScriptModel: A CSV script model with test data
    """
    return CsvScriptModelFactory.build(
        name="csv_model",
        table_name="csv_data",
        args=["echo", "id,name,value\\n1,test,100\\n2,demo,200"],
    )


# ====================
# Metric & Dimension Fixtures
# ====================


@pytest.fixture
def sample_metrics():
    """
    Create a collection of sample metrics for testing.

    Returns:
        list: List of Metric objects with various configurations
    """
    return [
        MetricFactory.build(name="revenue", expression="SUM(amount)", description="Total revenue"),
        MetricFactory.build(
            name="avg_order_value", expression="AVG(amount)", description="Average order value"
        ),
        MetricFactory.build(
            name="customer_count",
            expression="COUNT(DISTINCT customer_id)",
            description="Unique customer count",
        ),
    ]


@pytest.fixture
def sample_dimensions():
    """
    Create a collection of sample dimensions for testing.

    Returns:
        list: List of Dimension objects with various configurations
    """
    return [
        DimensionFactory.build(
            name="category", expression="product_category", description="Product category"
        ),
        DimensionFactory.build(
            name="region",
            expression="CASE WHEN state IN ('CA', 'OR', 'WA') THEN 'West' ELSE 'Other' END",
            description="Geographic region",
        ),
        DimensionFactory.build(
            name="date_month",
            expression="DATE_TRUNC('month', order_date)",
            description="Order month",
        ),
    ]


@pytest.fixture
def metric_with_references():
    """
    Create metrics that reference other metrics for composition testing.

    Returns:
        dict: Dictionary with base and derived metrics
    """
    base_metric = MetricFactory.build(name="base_revenue", expression="SUM(amount)")

    derived_metric = MetricFactory.build(
        name="revenue_with_tax", expression="${ref(base_revenue)} * 1.1"
    )

    complex_metric = MetricFactory.build(
        name="revenue_per_customer",
        expression="${ref(revenue_with_tax)} / COUNT(DISTINCT customer_id)",
    )

    return {
        "base": base_metric,
        "derived": derived_metric,
        "complex": complex_metric,
        "all": [base_metric, derived_metric, complex_metric],
    }


# ====================
# Trace Fixtures
# ====================


@pytest.fixture
def mock_trace_scatter():
    """
    Create a mock trace with scatter plot configuration.

    Returns:
        Trace: A trace configured for scatter plots
    """
    return TraceFactory.build(
        name="scatter_trace",
        model="ref(test_model)",
        props=ScatterTracePropsFactory.build(x="?{date}", y="?{value}"),
    )


@pytest.fixture
def mock_trace_surface():
    """
    Create a mock trace with surface plot configuration.

    Returns:
        Trace: A trace configured for surface plots
    """
    return TraceFactory.build(
        name="surface_trace",
        model="ref(test_model)",
        props=SurfaceTracePropsFactory.build(z=["?{x_val}", "?{y_val}"]),
    )


@pytest.fixture
def mock_trace_with_filters():
    """
    Create a mock trace with filters and ordering.

    Returns:
        Mock: A trace with complex filtering
    """
    trace = Mock(spec=Trace)
    trace.name = "filtered_trace"
    trace.model = "ref(orders_model)"
    trace.filters = [
        {"column": "amount", "operator": ">", "value": 100},
        {"column": "status", "operator": "=", "value": "completed"},
    ]
    trace.order_by = ["order_date DESC", "amount ASC"]
    trace.cohort_on = "customer_id"
    trace.props = ScatterTracePropsFactory.build()

    return trace


# ====================
# Project & DAG Fixtures
# ====================


@pytest.fixture
def mock_project_dag():
    """
    Create a mock ProjectDag with proper structure.

    Returns:
        Mock: A mock DAG object
    """
    dag = Mock(spec=ProjectDag)
    dag.nodes = Mock(return_value=[])
    dag.edges = Mock(return_value=[])
    dag.predecessors = Mock(return_value=[])
    dag.successors = Mock(return_value=[])
    dag.descendants = Mock(return_value=[])
    dag.__len__ = Mock(return_value=0)

    return dag


@pytest.fixture
def simple_project(mock_project_dag):
    """
    Create a simple project with basic configuration.

    Args:
        mock_project_dag: Mock DAG fixture

    Returns:
        Project: A simple project with source, model, and dashboard
    """
    source = SourceFactory.build()
    model = SqlModelFactory.build(source="ref(source)")
    trace = TraceFactory.build(model="ref(model)")
    chart = ChartFactory.build(traces=["ref(trace)"])
    dashboard = DashboardFactory.build()

    project = ProjectFactory.build(
        name="simple_project",
        sources=[source],
        models=[model],
        traces=[trace],
        charts=[chart],
        dashboards=[dashboard],
        metrics=[],
        dimensions=[],
    )

    # Attach the mock DAG
    project.dag = Mock(return_value=mock_project_dag)

    return project


@pytest.fixture
def complex_project(mock_project_dag, sample_metrics, sample_dimensions):
    """
    Create a complex project with multiple models, metrics, and dimensions.

    Args:
        mock_project_dag: Mock DAG fixture
        sample_metrics: Sample metrics fixture
        sample_dimensions: Sample dimensions fixture

    Returns:
        Project: A complex project configuration
    """
    # Create multiple sources
    postgres_source = Mock(spec=PostgresqlSource)
    postgres_source.name = "postgres_db"
    postgres_source.type = "postgresql"

    duckdb_source = Mock(spec=DuckdbSource)
    duckdb_source.name = "analytics_db"
    duckdb_source.type = "duckdb"

    # Create models
    base_model = SqlModelFactory.build(
        name="base_model", sql="SELECT * FROM raw_data", source="ref(postgres_db)"
    )

    derived_model = SqlModelFactory.build(
        name="derived_model",
        sql="SELECT * FROM ${ref(base_model)} WHERE active = true",
        source="ref(postgres_db)",
    )

    # Create project
    project = ProjectFactory.build(
        name="complex_project",
        sources=[postgres_source, duckdb_source],
        models=[base_model, derived_model],
        metrics=sample_metrics,
        dimensions=sample_dimensions,
        traces=[],
        charts=[],
        dashboards=[],
    )

    # Configure DAG with relationships
    mock_project_dag.predecessors = Mock(
        side_effect=lambda x: {derived_model: [base_model], base_model: []}.get(x, [])
    )

    project.dag = Mock(return_value=mock_project_dag)

    return project


# ====================
# Test Data Fixtures
# ====================


@pytest.fixture
def sample_sql_queries():
    """
    Provide sample SQL queries for testing.

    Returns:
        dict: Dictionary of SQL query strings
    """
    return {
        "simple_select": "SELECT id, name FROM users",
        "with_join": """
            SELECT u.id, u.name, o.amount 
            FROM users u 
            JOIN orders o ON u.id = o.user_id
        """,
        "with_aggregation": """
            SELECT 
                customer_id,
                COUNT(*) as order_count,
                SUM(amount) as total_amount
            FROM orders
            GROUP BY customer_id
        """,
        "with_cte": """
            WITH monthly_sales AS (
                SELECT 
                    DATE_TRUNC('month', order_date) as month,
                    SUM(amount) as revenue
                FROM orders
                GROUP BY 1
            )
            SELECT * FROM monthly_sales
        """,
        "with_window": """
            SELECT 
                id,
                amount,
                ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY order_date) as order_rank
            FROM orders
        """,
    }


@pytest.fixture
def temp_project_dir(tmp_path):
    """
    Create a temporary project directory structure.

    Args:
        tmp_path: pytest's tmp_path fixture

    Returns:
        Path: Path to temporary project directory
    """
    project_dir = tmp_path / "test_project"
    project_dir.mkdir()

    # Create standard project structure
    (project_dir / "models").mkdir()
    (project_dir / "sources").mkdir()
    (project_dir / "dashboards").mkdir()
    (project_dir / ".visivo").mkdir()

    # Create a basic project file
    project_file = project_dir / "project.visivo.yml"
    project_file.write_text(
        """
name: test_project
sources:
  - name: test_source
    type: sqlite
    database: ":memory:"
    """
    )

    return project_dir


# ====================
# Mock Response Fixtures
# ====================


@pytest.fixture
def mock_query_response():
    """
    Create mock database query responses.

    Returns:
        dict: Dictionary of mock query results
    """
    return {
        "users": [
            {"id": 1, "name": "Alice", "email": "alice@example.com"},
            {"id": 2, "name": "Bob", "email": "bob@example.com"},
            {"id": 3, "name": "Charlie", "email": "charlie@example.com"},
        ],
        "orders": [
            {"id": 1, "user_id": 1, "amount": 100.00, "status": "completed"},
            {"id": 2, "user_id": 2, "amount": 250.00, "status": "completed"},
            {"id": 3, "user_id": 1, "amount": 75.50, "status": "pending"},
        ],
        "aggregated": [
            {"customer_id": 1, "total_amount": 175.50, "order_count": 2},
            {"customer_id": 2, "total_amount": 250.00, "order_count": 1},
        ],
    }


# ====================
# Utility Fixtures
# ====================


@pytest.fixture
def mock_logger():
    """
    Create a mock logger for testing.

    Returns:
        Mock: Mock logger object
    """
    logger = Mock()
    logger.debug = Mock()
    logger.info = Mock()
    logger.warning = Mock()
    logger.error = Mock()
    logger.critical = Mock()

    return logger


@pytest.fixture(autouse=True)
def reset_singletons():
    """
    Reset singleton instances between tests to ensure test isolation.

    This fixture runs automatically before each test.
    """
    # Add any singleton resets here if needed
    yield
    # Cleanup after test if needed


@pytest.fixture
def mock_flask_app():
    """
    Create a mock Flask application for server testing.

    Returns:
        Mock: Mock Flask app
    """
    app = Mock()
    app.config = {}
    app.route = Mock()
    app.run = Mock()

    return app


# ====================
# Parameterized Fixtures
# ====================


@pytest.fixture(params=["postgresql", "snowflake", "duckdb", "sqlite"])
def any_source(
    request, mock_postgresql_source, mock_snowflake_source, mock_duckdb_source, mock_sqlite_source
):
    """
    Parameterized fixture that provides different source types.

    This allows running the same test with multiple source types.

    Args:
        request: pytest request object with param

    Returns:
        Source: One of the mock source objects
    """
    sources = {
        "postgresql": mock_postgresql_source,
        "snowflake": mock_snowflake_source,
        "duckdb": mock_duckdb_source,
        "sqlite": mock_sqlite_source,
    }
    return sources[request.param]


@pytest.fixture(params=["scatter", "surface", "bar", "line"])
def trace_with_props(request):
    """
    Parameterized fixture for traces with different prop types.

    Args:
        request: pytest request object with param

    Returns:
        Trace: Trace with specific prop type
    """
    props_map = {
        "scatter": ScatterTracePropsFactory(x="?{x}", y="?{y}"),
        "surface": SurfaceTracePropsFactory(z=["?{z1}", "?{z2}"]),
        "bar": ScatterTracePropsFactory(x="?{category}", y="?{count}"),
        "line": ScatterTracePropsFactory(x="?{date}", y="?{value}"),
    }

    return TraceFactory.build(name=f"{request.param}_trace", props=props_map[request.param])
