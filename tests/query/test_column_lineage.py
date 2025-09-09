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


class TestColumnLineageExtractor:
    """Test suite for column lineage extraction."""

    def test_simple_select_all_columns(self):
        """Test extraction from a simple SELECT statement with explicit columns."""
        sql = "SELECT id, name, email FROM users"

        extractor = ColumnLineageExtractor()
        lineage = extractor.extract_lineage(sql)

        # Check output columns
        assert len(lineage.output_columns) == 3
        col_names = [col.name for col in lineage.output_columns]
        assert "id" in col_names
        assert "name" in col_names
        assert "email" in col_names

        # Check table references
        assert len(lineage.table_references) == 1
        assert lineage.table_references[0].name == "users"
        assert not lineage.table_references[0].is_cte

        # No errors
        assert len(lineage.errors) == 0

    def test_select_with_aliases(self):
        """Test extraction with column aliases."""
        sql = """
        SELECT 
            user_id AS id,
            CONCAT(first_name, ' ', last_name) AS full_name,
            created_at AS registration_date
        FROM users
        """

        lineage = extract_column_lineage(sql)

        # Check aliased columns
        assert len(lineage.output_columns) == 3

        # Find the aliased columns
        id_col = next((col for col in lineage.output_columns if col.name == "id"), None)
        assert id_col is not None
        assert "user_id" in id_col.expression

        full_name_col = next(
            (col for col in lineage.output_columns if col.name == "full_name"), None
        )
        assert full_name_col is not None
        assert full_name_col.is_computed  # It's a computed expression
        assert "CONCAT" in full_name_col.expression.upper()

    def test_select_star_without_schema(self):
        """Test SELECT * without schema information."""
        sql = "SELECT * FROM orders"

        lineage = extract_column_lineage(sql)

        # Should have a placeholder for *
        assert len(lineage.output_columns) >= 1
        star_col = lineage.output_columns[0]
        assert star_col.name == "*" or "orders" in star_col.expression
        assert star_col.source_table == "orders"

    def test_select_star_with_schema(self):
        """Test SELECT * with schema information for expansion."""
        sql = "SELECT * FROM products"

        schema_info = {
            "products": {
                "id": "INTEGER",
                "name": "VARCHAR",
                "price": "DECIMAL",
                "category": "VARCHAR",
            }
        }

        extractor = ColumnLineageExtractor(schema_info=schema_info)
        lineage = extractor.extract_lineage(sql)

        # Should expand * to actual columns
        assert len(lineage.output_columns) == 4
        col_names = [col.name for col in lineage.output_columns]
        assert "id" in col_names
        assert "name" in col_names
        assert "price" in col_names
        assert "category" in col_names

        # Check data types are preserved
        id_col = next((col for col in lineage.output_columns if col.name == "id"), None)
        assert id_col.data_type == "INTEGER"
        assert id_col.source_table == "products"
        assert id_col.source_column == "id"

    def test_simple_join(self):
        """Test extraction from a JOIN query."""
        sql = """
        SELECT 
            u.id,
            u.name,
            o.order_id,
            o.total
        FROM users u
        JOIN orders o ON u.id = o.user_id
        """

        lineage = extract_column_lineage(sql)

        # Check output columns
        assert len(lineage.output_columns) == 4

        # Check table references
        assert len(lineage.table_references) == 2
        table_names = [ref.name for ref in lineage.table_references]
        assert "users" in table_names
        assert "orders" in table_names

        # Check input columns (from JOIN condition)
        assert len(lineage.input_columns) > 0
        input_col_names = [(col.name, col.source_table) for col in lineage.input_columns]
        assert ("id", "u") in input_col_names or ("id", None) in input_col_names
        assert ("user_id", "o") in input_col_names or ("user_id", None) in input_col_names

    def test_complex_join_with_where(self):
        """Test extraction from complex JOIN with WHERE clause."""
        sql = """
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

        lineage = extract_column_lineage(sql)

        # Check output columns (including aggregates)
        assert len(lineage.output_columns) == 3
        col_names = [col.name for col in lineage.output_columns]
        assert "customer_name" in col_names
        assert "order_count" in col_names
        assert "total_spent" in col_names

        # Check computed columns
        order_count = next(
            (col for col in lineage.output_columns if col.name == "order_count"), None
        )
        assert order_count.is_computed
        assert "COUNT" in order_count.expression.upper()

        # Check input columns from various clauses
        input_col_names = [col.name for col in lineage.input_columns]
        assert "customer_id" in input_col_names  # From JOIN and GROUP BY
        assert "status" in input_col_names  # From WHERE
        assert "order_date" in input_col_names  # From WHERE

    def test_single_cte(self):
        """Test extraction with a single CTE."""
        sql = """
        WITH active_users AS (
            SELECT id, name, email
            FROM users
            WHERE status = 'active'
        )
        SELECT * FROM active_users
        """

        lineage = extract_column_lineage(sql)

        # Check CTE definitions
        assert "active_users" in lineage.cte_definitions
        cte_lineage = lineage.cte_definitions["active_users"]
        assert len(cte_lineage.output_columns) == 3

        # Check main query references CTE
        assert any(ref.name == "active_users" and ref.is_cte for ref in lineage.table_references)

    def test_nested_ctes(self):
        """Test extraction with nested/chained CTEs."""
        sql = """
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

        lineage = extract_column_lineage(sql)

        # Check both CTEs are captured
        assert "base_data" in lineage.cte_definitions
        assert "user_totals" in lineage.cte_definitions

        # Check base_data CTE
        base_cte = lineage.cte_definitions["base_data"]
        assert len(base_cte.output_columns) == 3
        assert len(base_cte.table_references) == 1
        assert base_cte.table_references[0].name == "orders"

        # Check user_totals CTE
        totals_cte = lineage.cte_definitions["user_totals"]
        assert len(totals_cte.output_columns) == 3
        # Should reference base_data
        assert any(ref.name == "base_data" for ref in totals_cte.table_references)

        # Check main query
        assert len(lineage.output_columns) == 3
        main_tables = [ref.name for ref in lineage.table_references]
        assert "user_totals" in main_tables
        assert "users" in main_tables

    def test_subquery_in_select(self):
        """Test extraction with subquery in SELECT clause."""
        sql = """
        SELECT 
            u.id,
            u.name,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id) as order_count
        FROM users u
        """

        lineage = extract_column_lineage(sql)

        # Check output columns
        assert len(lineage.output_columns) == 3

        # Find the subquery column
        order_count_col = next(
            (col for col in lineage.output_columns if col.name == "order_count"), None
        )
        assert order_count_col is not None
        assert order_count_col.is_computed
        assert "SELECT" in order_count_col.expression

    def test_subquery_in_from(self):
        """Test extraction with subquery in FROM clause."""
        sql = """
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

        lineage = extract_column_lineage(sql)

        # Check output columns from main query
        assert len(lineage.output_columns) == 3
        col_names = [col.name for col in lineage.output_columns]
        assert "user_id" in col_names
        assert "total_orders" in col_names
        assert "name" in col_names

    def test_union_query(self):
        """Test extraction from UNION query."""
        sql = """
        SELECT id, name, 'customer' as type FROM customers
        UNION
        SELECT id, name, 'supplier' as type FROM suppliers
        """

        lineage = extract_column_lineage(sql)

        # Should capture columns from both parts
        assert len(lineage.output_columns) >= 3

        # Should reference both tables
        table_names = [ref.name for ref in lineage.table_references]
        assert "customers" in table_names
        assert "suppliers" in table_names

    def test_different_sql_dialects(self):
        """Test extraction with different SQL dialects."""
        # PostgreSQL specific syntax
        postgres_sql = """
        SELECT 
            id,
            name::TEXT,
            data->>'field' as json_field
        FROM users
        """

        pg_lineage = extract_column_lineage(postgres_sql, dialect="postgresql")
        assert len(pg_lineage.output_columns) == 3
        assert not pg_lineage.errors

        # Snowflake specific syntax
        snowflake_sql = """
        SELECT 
            id,
            name,
            data:field::STRING as json_field
        FROM users
        """

        sf_lineage = extract_column_lineage(snowflake_sql, dialect="snowflake")
        assert len(sf_lineage.output_columns) == 3

        # BigQuery specific syntax
        bigquery_sql = """
        SELECT 
            id,
            name,
            EXTRACT(DATE FROM timestamp) as date_only
        FROM `project.dataset.users`
        """

        bq_lineage = extract_column_lineage(bigquery_sql, dialect="bigquery")
        assert len(bq_lineage.output_columns) == 3

    def test_window_functions(self):
        """Test extraction with window functions."""
        sql = """
        SELECT 
            id,
            name,
            salary,
            ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) as rank,
            AVG(salary) OVER (PARTITION BY department) as dept_avg_salary
        FROM employees
        """

        lineage = extract_column_lineage(sql)

        # Check output columns
        assert len(lineage.output_columns) == 5

        # Check window function columns are marked as computed
        rank_col = next((col for col in lineage.output_columns if col.name == "rank"), None)
        assert rank_col is not None
        assert rank_col.is_computed
        assert "ROW_NUMBER" in rank_col.expression

    def test_case_statements(self):
        """Test extraction with CASE statements."""
        sql = """
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

        lineage = extract_column_lineage(sql)

        # Check output columns
        assert len(lineage.output_columns) == 4

        # CASE columns should be computed
        age_group = next((col for col in lineage.output_columns if col.name == "age_group"), None)
        assert age_group is not None
        assert age_group.is_computed
        assert "CASE" in age_group.expression

    def test_fully_qualified_names(self):
        """Test extraction with fully qualified table names."""
        sql = """
        SELECT 
            u.id,
            u.name,
            o.order_id
        FROM database1.schema1.users u
        JOIN database2.schema2.orders o ON u.id = o.user_id
        """

        lineage = extract_column_lineage(sql)

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

    def test_invalid_sql(self):
        """Test handling of invalid SQL."""
        sql = "SELECT FROM WHERE invalid syntax"

        lineage = extract_column_lineage(sql)

        # Should capture the error
        assert len(lineage.errors) > 0
        assert "parse" in lineage.errors[0].lower() or "error" in lineage.errors[0].lower()

    def test_empty_sql(self):
        """Test handling of empty SQL."""
        sql = ""

        lineage = extract_column_lineage(sql)

        # Should handle gracefully
        assert len(lineage.output_columns) == 0
        assert len(lineage.errors) > 0

    def test_complex_real_world_query(self):
        """Test a complex real-world query with multiple features."""
        sql = """
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

        lineage = extract_column_lineage(sql, dialect="postgresql")

        # Should successfully parse this complex query
        assert len(lineage.errors) == 0

        # Check CTEs
        assert "monthly_sales" in lineage.cte_definitions
        assert "customer_segments" in lineage.cte_definitions

        # Check output columns
        assert len(lineage.output_columns) == 6
        col_names = [col.name for col in lineage.output_columns]
        assert "month" in col_names
        assert "segment" in col_names
        assert "customer_count" in col_names
        assert "avg_monthly_spend" in col_names
        assert "total_revenue" in col_names
        assert "median_spend" in col_names

        # Check table references in main query
        main_tables = [ref.name for ref in lineage.table_references if ref.is_cte]
        assert "monthly_sales" in main_tables
        assert "customer_segments" in main_tables
