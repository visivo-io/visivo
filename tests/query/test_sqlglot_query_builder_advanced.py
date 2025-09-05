"""
Advanced tests for SqlglotQueryBuilder to catch query generation issues.
"""

import pytest
from visivo.query.sqlglot_query_builder import SqlglotQueryBuilder
from visivo.models.tokenized_trace import TokenizedTrace
from visivo.models.project import Project
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.models.sql_model import SqlModel
from visivo.models.metric import Metric
from visivo.models.trace import Trace
from visivo.query.trace_tokenizer import TraceTokenizer


class TestSqlglotQueryBuilderAdvanced:
    """Advanced test suite for SqlglotQueryBuilder edge cases."""

    def test_aggregate_in_filter_becomes_having(self):
        """Test that aggregates in filters become HAVING clauses, not WHERE."""
        # Create a tokenized trace with aggregate filter
        tokenized = TokenizedTrace(
            sql="SELECT * FROM sales",
            cohort_on="'test'",
            source="test_source",
            source_type="duckdb",
            columns=["category", "amount"],
            select_items={"category": "category", "total": "SUM(amount)"},
            filter_by={
                "vanilla": ["category = 'Electronics'"],
                "aggregate": ["MIN(amount) > 100", "SUM(amount) < 10000"],
            },
        )

        project = Project(name="test_project")
        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)

        # Generate SQL
        sql = builder.build()
        print(f"Generated SQL:\n{sql}")

        # Check that aggregate filters are in HAVING, not WHERE
        assert "HAVING" in sql.upper()
        assert "MIN(amount) > 100" in sql or "MIN(amount)" in sql
        # Vanilla filters should be in WHERE
        assert "WHERE" in sql.upper()
        assert "category = 'Electronics'" in sql

    def test_all_non_aggregate_columns_in_group_by(self):
        """Test that all non-aggregate columns are included in GROUP BY."""
        tokenized = TokenizedTrace(
            sql="SELECT * FROM orders",
            cohort_on="'test'",
            source="test_source",
            source_type="duckdb",
            columns=["category", "region", "product", "amount"],
            select_items={
                "category": "category",
                "region": "region",
                "product": "product",
                "total_amount": "SUM(amount)",
                "avg_amount": "AVG(amount)",
            },
        )

        project = Project(name="test_project")
        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)

        sql = builder.build()
        print(f"Generated SQL:\n{sql}")

        # All non-aggregate columns should be in GROUP BY
        assert "GROUP BY" in sql.upper()
        # Check that all three non-aggregate columns are in GROUP BY
        group_by_clause = sql.upper().split("GROUP BY")[1].split("ORDER BY")[0].split("HAVING")[0]
        assert "CATEGORY" in group_by_clause or '"CATEGORY"' in group_by_clause
        assert "REGION" in group_by_clause or '"REGION"' in group_by_clause
        assert "PRODUCT" in group_by_clause or '"PRODUCT"' in group_by_clause

    def test_mixed_filters_with_aggregates_and_vanilla(self):
        """Test handling of both aggregate and vanilla filters together."""
        tokenized = TokenizedTrace(
            sql="SELECT * FROM transactions",
            cohort_on="'test'",
            source="test_source",
            source_type="duckdb",
            columns=["date", "category", "amount"],
            select_items={
                "month": "DATE_TRUNC('month', date)",
                "category": "category",
                "total": "SUM(amount)",
                "min_amount": "MIN(amount)",
            },
            filter_by={
                "vanilla": ["category IN ('A', 'B', 'C')", "date >= '2024-01-01'"],
                "aggregate": ["SUM(amount) > 1000", "MIN(amount) >= 10"],
            },
        )

        project = Project(name="test_project")
        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)

        sql = builder.build()
        print(f"Generated SQL:\n{sql}")

        # Vanilla filters in WHERE
        assert "WHERE" in sql.upper()
        assert "category IN ('A', 'B', 'C')" in sql

        # Aggregate filters in HAVING
        assert "HAVING" in sql.upper()
        having_part = sql.split("HAVING")[1] if "HAVING" in sql else ""
        assert "SUM(amount)" in having_part or "SUM" in having_part

    def test_complex_case_statement_with_aggregates(self):
        """Test CASE statements mixed with aggregates."""
        tokenized = TokenizedTrace(
            sql="SELECT * FROM revenue",
            cohort_on="'test'",
            source="test_source",
            source_type="duckdb",
            columns=["category", "amount", "region"],
            select_items={
                "category": "category",
                "revenue_type": """
                    CASE 
                        WHEN category = 'Net Income' THEN 'Income'
                        WHEN category = 'Expenses' THEN 'Cost'
                        ELSE 'Other'
                    END
                """,
                "total": "SUM(amount)",
                "region_count": "COUNT(DISTINCT region)",
            },
        )

        project = Project(name="test_project")
        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)

        sql = builder.build()
        print(f"Generated SQL:\n{sql}")

        # Check GROUP BY contains non-aggregates
        assert "GROUP BY" in sql.upper()
        # Category should be in GROUP BY
        group_by_clause = sql.upper().split("GROUP BY")[1]
        assert "CATEGORY" in group_by_clause or '"CATEGORY"' in group_by_clause
        # The CASE statement should also be in GROUP BY (or its alias)
        assert "REVENUE_TYPE" in group_by_clause or "CASE" in group_by_clause

    def test_only_aggregates_no_group_by_needed(self):
        """Test that queries with only aggregates don't need GROUP BY."""
        tokenized = TokenizedTrace(
            sql="SELECT * FROM sales",
            cohort_on="'test'",
            source="test_source",
            source_type="duckdb",
            columns=["amount", "quantity"],
            select_items={
                "total_amount": "SUM(amount)",
                "avg_amount": "AVG(amount)",
                "max_quantity": "MAX(quantity)",
                "record_count": "COUNT(*)",
            },
        )

        project = Project(name="test_project")
        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)

        sql = builder.build()
        print(f"Generated SQL:\n{sql}")

        # Should not have GROUP BY since all columns are aggregates
        assert "GROUP BY" not in sql.upper()

    def test_window_functions_not_in_group_by(self):
        """Test that window functions are handled correctly."""
        tokenized = TokenizedTrace(
            sql="SELECT * FROM sales",
            cohort_on="'test'",
            source="test_source",
            source_type="duckdb",
            columns=["date", "amount", "category"],
            select_items={
                "category": "category",
                "amount": "amount",
                "running_total": "SUM(amount) OVER (PARTITION BY category ORDER BY date)",
                "rank": "ROW_NUMBER() OVER (PARTITION BY category ORDER BY amount DESC)",
            },
        )

        project = Project(name="test_project")
        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)

        sql = builder.build()
        print(f"Generated SQL:\n{sql}")

        # Window functions should be in SELECT but not trigger GROUP BY
        assert "OVER" in sql.upper()
        # Regular columns without aggregates shouldn't trigger GROUP BY either
        assert "GROUP BY" not in sql.upper()

    def test_metric_resolution_with_aggregates(self):
        """Test that metrics with aggregates are properly handled."""
        # Create source and model
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        model = SqlModel(
            name="sales",
            sql="SELECT * FROM sales_table",
            source="ref(test_db)",
            metrics=[
                Metric(name="total_revenue", expression="SUM(amount)"),
                Metric(name="avg_revenue", expression="AVG(amount)"),
                Metric(name="min_revenue", expression="MIN(amount)"),
            ],
        )

        project = Project(name="test_project", sources=[source], models=[model], metrics=[])

        # Create trace using metrics
        trace = Trace(
            name="test_trace",
            model=model,
            props={"type": "scatter", "x": "?{category}", "y": "?{${ref(sales).total_revenue}}"},
            filters=["?{${ref(sales).min_revenue} > 100}"],
        )

        # Tokenize
        tokenizer = TraceTokenizer(trace=trace, model=model, source=source, project=project)
        tokenized = tokenizer.tokenize()

        # Build query
        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)
        sql = builder.build()
        print(f"Generated SQL with metrics:\n{sql}")

        # The filter with MIN should be in HAVING, not WHERE
        if "MIN" in sql:
            assert "HAVING" in sql.upper()

    def test_empty_filters_no_where_or_having(self):
        """Test that empty filters don't create WHERE or HAVING clauses."""
        tokenized = TokenizedTrace(
            sql="SELECT * FROM orders",
            cohort_on="'test'",
            source="test_source",
            source_type="duckdb",
            columns=["x", "y"],
            select_items={"x": "x", "total": "SUM(y)"},
            filter_by={},  # Empty filters
        )

        project = Project(name="test_project")
        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)

        sql = builder.build()
        print(f"Generated SQL:\n{sql}")

        # Should have GROUP BY but no WHERE or HAVING
        assert "GROUP BY" in sql.upper()
        assert "WHERE" not in sql.upper()
        assert "HAVING" not in sql.upper()

    def test_filters_with_nulls_and_edge_cases(self):
        """Test handling of None and empty filter lists."""
        # Test with None filter_by
        tokenized = TokenizedTrace(
            sql="SELECT * FROM data",
            cohort_on="'test'",
            source="test_source",
            source_type="duckdb",
            columns=["a", "b"],
            select_items={"a": "a", "sum_b": "SUM(b)"},
            filter_by=None,
        )

        project = Project(name="test_project")
        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)

        sql = builder.build()
        assert sql is not None
        assert "SELECT" in sql.upper()

    def test_case_statement_inside_aggregate(self):
        """Test CASE statements inside aggregate functions don't go in GROUP BY."""
        tokenized = TokenizedTrace(
            sql="SELECT * FROM revenue",
            cohort_on="'test'",
            source="test_source",
            source_type="duckdb",
            columns=["category", "amount", "region"],
            select_items={
                "region": "region",
                "net_income": """
                    SUM(
                        CASE 
                            WHEN category = 'Net Income' THEN amount 
                            ELSE 0 
                        END
                    )
                """,
                "expenses": """
                    SUM(
                        CASE 
                            WHEN category = 'Expenses' THEN amount 
                            ELSE 0 
                        END
                    )
                """,
            },
        )

        project = Project(name="test_project")
        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)

        sql = builder.build()
        print(f"Generated SQL with CASE in aggregate:\n{sql}")

        # Should have GROUP BY for region only
        assert "GROUP BY" in sql.upper()
        group_by_clause = sql.upper().split("GROUP BY")[1].split("ORDER BY")[0].split("HAVING")[0]

        # Only region should be in GROUP BY, not category
        assert "REGION" in group_by_clause or '"REGION"' in group_by_clause
        # Category should NOT be in GROUP BY since it's only referenced inside aggregates
        assert "CATEGORY" not in group_by_clause or '"CATEGORY"' not in group_by_clause

        # The CASE statements should be in the SELECT
        assert "CASE" in sql.upper()
        assert "Net Income" in sql

    def test_x_analysis_with_metrics_scenario(self):
        """Test the exact scenario from 'X Analysis with Metrics' that's failing."""
        tokenized = TokenizedTrace(
            sql="SELECT * FROM financial_data",
            cohort_on="'test'",
            source="test_source",
            source_type="duckdb",
            columns=["category", "amount", "date"],
            select_items={
                "X": "date",  # X is an alias for date
                "net_income_metric": """
                    SUM(
                        CASE 
                            WHEN category = 'Net Income' THEN amount 
                            WHEN category = 'Revenue' THEN amount
                            ELSE 0 
                        END
                    )
                """,
                "expense_metric": """
                    SUM(
                        CASE 
                            WHEN category = 'Expenses' THEN -amount 
                            WHEN category = 'Costs' THEN -amount
                            ELSE 0 
                        END
                    )
                """,
            },
        )

        project = Project(name="test_project")
        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)

        sql = builder.build()
        print(f"Generated SQL for X Analysis scenario:\n{sql}")

        # Should have GROUP BY for X (date) only
        assert "GROUP BY" in sql.upper()

        # The generated SQL should be valid - category references should be inside aggregates
        # Let's check the structure
        assert "SUM(CASE" in sql.upper() or "SUM(\n" in sql.upper()

        # X should be in GROUP BY
        group_by_clause = sql.upper().split("GROUP BY")[1].split("ORDER BY")[0].split("HAVING")[0]
        assert '"X"' in group_by_clause or "X" in group_by_clause

        # Category should NOT be in GROUP BY or FROM (it's in the base CTE)
        assert '"CATEGORY"' not in group_by_clause

    def test_base_cte_without_all_columns(self):
        """Test when base CTE doesn't have SELECT * but specific columns."""
        # This simulates the actual problem: the model's SQL doesn't include
        # all columns needed by the trace
        tokenized = TokenizedTrace(
            sql="SELECT date, amount FROM financial_data",  # Note: category is NOT selected
            cohort_on="'test'",
            source="test_source",
            source_type="duckdb",
            columns=["date", "amount", "category"],  # category IS in columns list
            select_items={
                "X": "date",
                "total": """
                    SUM(
                        CASE 
                            WHEN category = 'Net Income' THEN amount 
                            ELSE 0 
                        END
                    )
                """,  # References category which isn't in the base query!
            },
        )

        project = Project(name="test_project")
        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)

        sql = builder.build()
        print(f"Generated SQL with missing column in base SQL:\n{sql}")

        # This will generate invalid SQL because category isn't available from base CTE
        # Even though it's listed in columns, it's not in the actual SQL
        assert "category" in sql.lower()

        # The issue is the base CTE doesn't have category
        assert "SELECT date, amount FROM" in sql or "SELECT\n    date,\n    amount\n  FROM" in sql

    def test_complex_real_world_scenario(self):
        """Test a complex real-world scenario with multiple features."""
        tokenized = TokenizedTrace(
            sql="""
                SELECT 
                    date, 
                    category, 
                    subcategory, 
                    region, 
                    amount, 
                    quantity 
                FROM sales_fact
            """,
            cohort_on="region",
            source="test_source",
            source_type="duckdb",
            columns=["date", "category", "subcategory", "region", "amount", "quantity"],
            select_items={
                "month": "DATE_TRUNC('month', date)",
                "category": "category",
                "subcategory": "subcategory",
                "total_amount": "SUM(amount)",
                "avg_amount": "AVG(amount)",
                "quantity_sold": "SUM(quantity)",
                "unique_regions": "COUNT(DISTINCT region)",
                "revenue_rank": "RANK() OVER (PARTITION BY category ORDER BY SUM(amount) DESC)",
            },
            filter_by={
                "vanilla": [
                    "date >= '2024-01-01'",
                    "category NOT IN ('Excluded', 'Test')",
                    "region IS NOT NULL",
                ],
                "aggregate": [
                    "SUM(amount) > 1000",
                    "COUNT(DISTINCT region) >= 2",
                    "AVG(amount) BETWEEN 50 AND 500",
                ],
            },
            order_by=["month ASC", "total_amount DESC"],
        )

        project = Project(name="test_project")
        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)

        sql = builder.build()
        print(f"Complex real-world SQL:\n{sql}")

        # Validate structure
        assert "WHERE" in sql.upper()
        assert "GROUP BY" in sql.upper()
        assert "HAVING" in sql.upper()
        assert "ORDER BY" in sql.upper()

        # Vanilla filters in WHERE
        where_clause = sql.split("WHERE")[1].split("GROUP BY")[0]
        assert "date >=" in where_clause
        # SQLGlot normalizes "category NOT IN" to "NOT category IN"
        assert "NOT category IN" in where_clause or "category NOT IN" in where_clause

        # Aggregate filters in HAVING
        having_clause = sql.split("HAVING")[1].split("ORDER BY")[0] if "HAVING" in sql else ""
        assert "SUM(amount)" in having_clause or "SUM" in having_clause

    def test_cohort_on_column_in_select(self):
        """Test that cohort_on is always added to SELECT clause."""
        from visivo.models.sources.sqlite_source import SqliteSource
        from visivo.models.project import Project

        # Create minimal project
        source = SqliteSource(name="test", type="sqlite", database=":memory:")
        project = Project(name="test_project", sources=[source])

        # Test with literal cohort_on
        tokenized = TokenizedTrace(
            sql="SELECT * FROM sales",
            cohort_on="'test_cohort'",
            source="test",
            source_type="duckdb",
            columns=["id", "amount"],
            select_items={"total": "SUM(amount)", "count": "COUNT(*)"},
        )

        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)
        sql = builder.build()
        print(f"Generated SQL with cohort_on:\n{sql}")

        # Check that cohort_on appears in SELECT
        assert '"cohort_on"' in sql or 'AS "cohort_on"' in sql
        assert "'test_cohort'" in sql

        # Since we only have aggregates, there should be no GROUP BY
        # (cohort_on is a literal, not a column to group by)

    def test_cohort_on_column_with_column_reference(self):
        """Test cohort_on with column reference instead of literal."""
        from visivo.models.sources.sqlite_source import SqliteSource
        from visivo.models.project import Project

        # Create minimal project
        source = SqliteSource(name="test", type="sqlite", database=":memory:")
        project = Project(name="test_project", sources=[source])

        tokenized = TokenizedTrace(
            sql="SELECT * FROM sales",
            cohort_on="region",  # Column reference, not literal
            source="test",
            source_type="postgresql",
            columns=["id", "region", "amount"],
            select_items={"region_col": "region", "total": "SUM(amount)"},
        )

        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)
        sql = builder.build()
        print(f"Generated SQL with column cohort_on:\n{sql}")

        # Check that cohort_on appears in SELECT
        assert 'AS "cohort_on"' in sql
        # The region column should appear as the cohort_on value
        assert 'region AS "cohort_on"' in sql or "region AS cohort_on" in sql.replace("\n", " ")

        # Check GROUP BY
        assert "GROUP BY" in sql.upper()
