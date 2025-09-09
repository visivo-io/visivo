"""
Tests for column lineage extraction using SQLGlot.

This module tests the ColumnLineageExtractor which parses SQL statements
to extract column dependencies and transformations.
"""

import pytest
from visivo.query.column_lineage import (
    ColumnLineageExtractor,
    ColumnInfo,
    TableReference,
    ColumnLineage,
    extract_column_lineage,
)


# ============================================================================
# Test Data Constants
# ============================================================================

# Simple SQL patterns for testing
SIMPLE_SELECT = "SELECT id, name, email FROM users"
SELECT_STAR = "SELECT * FROM orders"
SELECT_STAR_WITH_SCHEMA = "SELECT * FROM products"

# Complex SQL patterns
SELECT_WITH_ALIASES = """
    SELECT 
        user_id AS id,
        CONCAT(first_name, ' ', last_name) AS full_name,
        created_at AS registration_date
    FROM users
"""

SIMPLE_JOIN = """
    SELECT 
        u.id,
        u.name,
        o.order_id,
        o.total
    FROM users u
    JOIN orders o ON u.id = o.user_id
"""

COMPLEX_JOIN_WITH_WHERE = """
    SELECT 
        c.customer_name,
        COUNT(o.order_id) as order_count,
        SUM(o.amount) as total_spent
    FROM customers c
    LEFT JOIN orders o ON c.customer_id = o.customer_id
    WHERE c.status = 'active'
      AND o.order_date >= '2024-01-01'
    GROUP BY c.customer_id, c.customer_name
    HAVING COUNT(o.order_id) > 5
    ORDER BY total_spent DESC
"""

# CTE patterns
SINGLE_CTE = """
    WITH active_users AS (
        SELECT id, name, email
        FROM users
        WHERE status = 'active'
    )
    SELECT * FROM active_users
"""

NESTED_CTES = """
    WITH 
    base_data AS (
        SELECT user_id, order_id, amount
        FROM orders
        WHERE order_date >= '2024-01-01'
    ),
    user_totals AS (
        SELECT 
            user_id,
            COUNT(order_id) as order_count,
            SUM(amount) as total_amount
        FROM base_data
        GROUP BY user_id
    )
    SELECT 
        u.name,
        ut.order_count,
        ut.total_amount
    FROM user_totals ut
    JOIN users u ON ut.user_id = u.id
    WHERE ut.order_count > 10
"""

# Subquery patterns
SUBQUERY_IN_SELECT = """
    SELECT 
        u.id,
        u.name,
        (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) as order_count
    FROM users u
"""

SUBQUERY_IN_FROM = """
    SELECT 
        user_stats.user_id,
        user_stats.total_orders,
        u.name
    FROM (
        SELECT 
            user_id,
            COUNT(*) as total_orders
        FROM orders
        GROUP BY user_id
    ) as user_stats
    JOIN users u ON user_stats.user_id = u.id
"""

# Special SQL features
UNION_QUERY = """
    SELECT id, name, 'customer' as type FROM customers
    UNION
    SELECT id, name, 'supplier' as type FROM suppliers
"""

WINDOW_FUNCTIONS = """
    SELECT 
        id,
        name,
        salary,
        ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) as rank,
        AVG(salary) OVER (PARTITION BY department) as dept_avg_salary
    FROM employees
"""

CASE_STATEMENTS = """
    SELECT 
        id,
        name,
        CASE 
            WHEN age < 18 THEN 'minor'
            WHEN age >= 65 THEN 'senior'
            ELSE 'adult'
        END as age_group,
        CASE status
            WHEN 'A' THEN 'Active'
            WHEN 'I' THEN 'Inactive'
            ELSE 'Unknown'
        END as status_label
    FROM users
"""

FULLY_QUALIFIED_NAMES = """
    SELECT 
        u.id,
        u.name,
        o.order_id
    FROM database1.schema1.users u
    JOIN database2.schema2.orders o ON u.id = o.user_id
"""

# Dialect-specific SQL
POSTGRES_SQL = """
    SELECT 
        id,
        name::TEXT,
        data->>'field' as json_field
    FROM users
"""

SNOWFLAKE_SQL = """
    SELECT 
        id,
        name,
        data:field::STRING as json_field
    FROM users
"""

BIGQUERY_SQL = """
    SELECT 
        id,
        name,
        EXTRACT(DATE FROM timestamp) as date_only
    FROM `project.dataset.users`
"""

# Complex real-world query
COMPLEX_REAL_WORLD = """
    WITH monthly_sales AS (
        SELECT 
            DATE_TRUNC('month', order_date) as month,
            customer_id,
            SUM(amount) as monthly_total,
            COUNT(DISTINCT order_id) as order_count
        FROM orders
        WHERE order_date >= '2024-01-01'
          AND status = 'completed'
        GROUP BY 1, 2
    ),
    customer_segments AS (
        SELECT 
            customer_id,
            CASE 
                WHEN total_lifetime_value > 10000 THEN 'high'
                WHEN total_lifetime_value > 1000 THEN 'medium'
                ELSE 'low'
            END as segment
        FROM (
            SELECT 
                customer_id,
                SUM(amount) as total_lifetime_value
            FROM orders
            GROUP BY customer_id
        ) lifetime_values
    )
    SELECT 
        ms.month,
        cs.segment,
        COUNT(DISTINCT ms.customer_id) as customer_count,
        AVG(ms.monthly_total) as avg_monthly_spend,
        SUM(ms.monthly_total) as total_revenue,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ms.monthly_total) as median_spend
    FROM monthly_sales ms
    JOIN customer_segments cs ON ms.customer_id = cs.customer_id
    GROUP BY ms.month, cs.segment
    HAVING COUNT(DISTINCT ms.customer_id) > 10
    ORDER BY ms.month, total_revenue DESC
"""


class TestColumnLineageExtractor:
    """Test suite for column lineage extraction."""

    # ========================================================================
    # Helper Methods
    # ========================================================================

    def assert_column_names(self, lineage, expected_names):
        """Assert that output columns match expected names."""
        actual_names = [col.name for col in lineage.output_columns]
        for name in expected_names:
            assert name in actual_names, f"Expected column '{name}' not found in {actual_names}"

    def assert_table_references(self, lineage, expected_tables, check_cte=False):
        """Assert that table references match expected tables."""
        if check_cte:
            actual_tables = [ref.name for ref in lineage.table_references if ref.is_cte]
        else:
            actual_tables = [ref.name for ref in lineage.table_references if not ref.is_cte]

        for table in expected_tables:
            assert table in actual_tables, f"Expected table '{table}' not found in {actual_tables}"

    def assert_computed_column(self, lineage, col_name, expected_expression_part):
        """Assert that a column is computed and contains expected expression."""
        col = next((c for c in lineage.output_columns if c.name == col_name), None)
        assert col is not None, f"Column '{col_name}' not found"
        assert col.is_computed, f"Column '{col_name}' should be computed"
        assert (
            expected_expression_part in col.expression.upper()
        ), f"Expected '{expected_expression_part}' in expression '{col.expression}'"

    def assert_no_errors(self, lineage):
        """Assert that lineage extraction had no errors."""
        assert len(lineage.errors) == 0, f"Unexpected errors: {lineage.errors}"

    def find_column(self, lineage, col_name):
        """Find a column by name in output columns."""
        return next((col for col in lineage.output_columns if col.name == col_name), None)

    # ========================================================================
    # Parameterized Tests for Basic SELECT Statements
    # ========================================================================

    @pytest.mark.parametrize(
        "sql,expected_columns,expected_tables",
        [
            (SIMPLE_SELECT, ["id", "name", "email"], ["users"]),
            (SELECT_STAR, ["*"], ["orders"]),  # Without schema, returns placeholder
        ],
    )
    def test_basic_select_statements(self, sql, expected_columns, expected_tables):
        """Test basic SELECT statements."""
        lineage = extract_column_lineage(sql)

        if "*" in expected_columns:
            # For SELECT *, check that we have at least one column
            assert len(lineage.output_columns) >= 1
            star_col = lineage.output_columns[0]
            assert star_col.name == "*" or expected_tables[0] in star_col.expression
            assert star_col.source_table == expected_tables[0]
        else:
            self.assert_column_names(lineage, expected_columns)

        self.assert_table_references(lineage, expected_tables)
        self.assert_no_errors(lineage)

    # ========================================================================
    # Parameterized Tests for JOIN Queries
    # ========================================================================

    @pytest.mark.parametrize(
        "sql,expected_columns,expected_tables,check_aggregates",
        [
            (SIMPLE_JOIN, ["id", "name", "order_id", "total"], ["users", "orders"], False),
            (
                COMPLEX_JOIN_WITH_WHERE,
                ["customer_name", "order_count", "total_spent"],
                ["customers", "orders"],
                True,
            ),
        ],
    )
    def test_join_queries(self, sql, expected_columns, expected_tables, check_aggregates):
        """Test JOIN queries with various complexities."""
        lineage = extract_column_lineage(sql)

        self.assert_column_names(lineage, expected_columns)
        self.assert_table_references(lineage, expected_tables)

        if check_aggregates:
            # Check aggregated columns are marked as computed
            self.assert_computed_column(lineage, "order_count", "COUNT")
            self.assert_computed_column(lineage, "total_spent", "SUM")

            # Check input columns from various clauses
            input_col_names = [col.name for col in lineage.input_columns]
            assert "customer_id" in input_col_names  # From JOIN and GROUP BY
            assert "status" in input_col_names  # From WHERE
            assert "order_date" in input_col_names  # From WHERE

        self.assert_no_errors(lineage)

    # ========================================================================
    # Parameterized Tests for CTE Queries
    # ========================================================================

    @pytest.mark.parametrize(
        "sql,cte_names,main_output_cols",
        [
            (SINGLE_CTE, ["active_users"], None),  # SELECT * from CTE
            (NESTED_CTES, ["base_data", "user_totals"], ["name", "order_count", "total_amount"]),
        ],
    )
    def test_cte_queries(self, sql, cte_names, main_output_cols):
        """Test CTE (Common Table Expression) queries."""
        lineage = extract_column_lineage(sql)

        # Check all CTEs are captured
        for cte_name in cte_names:
            assert cte_name in lineage.cte_definitions, f"CTE '{cte_name}' not found"

        # Check main query output columns if specified
        if main_output_cols:
            self.assert_column_names(lineage, main_output_cols)

        # Check that CTEs are referenced as tables
        cte_refs = [ref.name for ref in lineage.table_references if ref.is_cte]
        assert any(cte in cte_refs for cte in cte_names)

        self.assert_no_errors(lineage)

    # ========================================================================
    # Parameterized Tests for Subqueries
    # ========================================================================

    @pytest.mark.parametrize(
        "sql,expected_columns,has_computed",
        [
            (SUBQUERY_IN_SELECT, ["id", "name", "order_count"], True),
            (SUBQUERY_IN_FROM, ["user_id", "total_orders", "name"], False),
        ],
    )
    def test_subquery_patterns(self, sql, expected_columns, has_computed):
        """Test different subquery patterns."""
        lineage = extract_column_lineage(sql)

        self.assert_column_names(lineage, expected_columns)

        if has_computed:
            # Check that subquery column is marked as computed
            order_count_col = self.find_column(lineage, "order_count")
            assert order_count_col is not None
            assert order_count_col.is_computed
            assert "SELECT" in order_count_col.expression

        self.assert_no_errors(lineage)

    # ========================================================================
    # Parameterized Tests for SQL Features
    # ========================================================================

    @pytest.mark.parametrize(
        "sql,feature,expected_cols,check_computed",
        [
            (UNION_QUERY, "union", 3, False),
            (WINDOW_FUNCTIONS, "window", 5, True),
            (CASE_STATEMENTS, "case", 4, True),
        ],
    )
    def test_sql_features(self, sql, feature, expected_cols, check_computed):
        """Test various SQL features like UNION, window functions, CASE statements."""
        lineage = extract_column_lineage(sql)

        # Check column count
        assert len(lineage.output_columns) >= expected_cols

        if check_computed:
            if feature == "window":
                self.assert_computed_column(lineage, "rank", "ROW_NUMBER")
            elif feature == "case":
                self.assert_computed_column(lineage, "age_group", "CASE")

        if feature == "union":
            # Check both tables are referenced
            self.assert_table_references(lineage, ["customers", "suppliers"])

        self.assert_no_errors(lineage)

    # ========================================================================
    # Parameterized Tests for Different SQL Dialects
    # ========================================================================

    @pytest.mark.parametrize(
        "sql,dialect,expected_cols",
        [
            (POSTGRES_SQL, "postgresql", 3),
            (SNOWFLAKE_SQL, "snowflake", 3),
            (BIGQUERY_SQL, "bigquery", 3),
        ],
    )
    def test_sql_dialects(self, sql, dialect, expected_cols):
        """Test SQL parsing with different dialects."""
        lineage = extract_column_lineage(sql, dialect=dialect)

        assert len(lineage.output_columns) == expected_cols
        self.assert_no_errors(lineage)

    # ========================================================================
    # Special Test Cases
    # ========================================================================

    def test_select_with_aliases(self):
        """Test extraction with column aliases."""
        lineage = extract_column_lineage(SELECT_WITH_ALIASES)

        self.assert_column_names(lineage, ["id", "full_name", "registration_date"])

        # Check alias mapping
        id_col = self.find_column(lineage, "id")
        assert id_col is not None
        assert "user_id" in id_col.expression

        # Check computed expression
        self.assert_computed_column(lineage, "full_name", "CONCAT")

    def test_select_star_with_schema(self):
        """Test SELECT * with schema information for expansion."""
        schema_info = {
            "products": {
                "id": "INTEGER",
                "name": "VARCHAR",
                "price": "DECIMAL",
                "category": "VARCHAR",
            }
        }

        extractor = ColumnLineageExtractor(schema_info=schema_info)
        lineage = extractor.extract_lineage(SELECT_STAR_WITH_SCHEMA)

        # Should expand * to actual columns
        self.assert_column_names(lineage, ["id", "name", "price", "category"])

        # Check data types are preserved
        id_col = self.find_column(lineage, "id")
        assert id_col.data_type == "INTEGER"
        assert id_col.source_table == "products"
        assert id_col.source_column == "id"

    def test_fully_qualified_names(self):
        """Test extraction with fully qualified table names."""
        lineage = extract_column_lineage(FULLY_QUALIFIED_NAMES)

        # Check table references include database/schema
        users_ref = next((ref for ref in lineage.table_references if ref.name == "users"), None)
        assert users_ref is not None
        assert users_ref.database == "database1"
        assert users_ref.schema == "schema1"
        assert users_ref.full_name == "database1.schema1.users"

        orders_ref = next((ref for ref in lineage.table_references if ref.name == "orders"), None)
        assert orders_ref is not None
        assert orders_ref.database == "database2"
        assert orders_ref.schema == "schema2"

    def test_complex_real_world_query(self):
        """Test a complex real-world query with multiple features."""
        lineage = extract_column_lineage(COMPLEX_REAL_WORLD, dialect="postgresql")

        # Should successfully parse without errors
        self.assert_no_errors(lineage)

        # Check CTEs
        assert "monthly_sales" in lineage.cte_definitions
        assert "customer_segments" in lineage.cte_definitions

        # Check output columns
        expected_cols = [
            "month",
            "segment",
            "customer_count",
            "avg_monthly_spend",
            "total_revenue",
            "median_spend",
        ]
        self.assert_column_names(lineage, expected_cols)

        # Check CTE references in main query
        self.assert_table_references(
            lineage, ["monthly_sales", "customer_segments"], check_cte=True
        )

    # ========================================================================
    # Error Handling Tests
    # ========================================================================

    @pytest.mark.parametrize(
        "sql,error_keyword",
        [
            ("SELECT FROM WHERE invalid syntax", "parse"),
            ("", ""),  # Empty SQL
        ],
    )
    def test_invalid_sql_handling(self, sql, error_keyword):
        """Test handling of invalid or empty SQL."""
        lineage = extract_column_lineage(sql)

        # Should capture errors
        assert len(lineage.errors) > 0

        if error_keyword and sql:  # Only check error message for non-empty SQL
            error_msg = lineage.errors[0].lower()
            assert error_keyword in error_msg or "error" in error_msg
