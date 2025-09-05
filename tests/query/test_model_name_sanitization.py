"""
Tests for model name sanitization in multi-model queries.
"""

import pytest
from visivo.query.sqlglot_query_builder import SqlglotQueryBuilder
from visivo.models.tokenized_trace import TokenizedTrace
from visivo.models.project import Project
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.models.sql_model import SqlModel
from visivo.models.relation import Relation


class TestModelNameSanitization:
    """Test suite for handling model names with spaces and special characters."""

    def test_model_with_spaces_in_name(self):
        """Test that model names with spaces are properly sanitized."""
        # Create models with problematic names
        test_table_model = SqlModel(
            name="test table",  # Has a space!
            sql="SELECT * FROM test_table_data",
            source="ref(test_db)",
        )

        waterfall_model = SqlModel(
            name="waterfall_model_duckdb",  # Normal name
            sql="SELECT * FROM waterfall_data",
            source="ref(test_db)",
        )

        # Create relation with spaces in model name (needs quotes)
        relation = Relation(
            name="test_relation",
            condition="${ref('test table').x} = ${ref(waterfall_model_duckdb).row}",
            join_type="inner",
        )

        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        project = Project(
            name="test_project",
            sources=[source],
            models=[test_table_model, waterfall_model],
            relations=[relation],
        )

        # Create tokenized trace
        tokenized = TokenizedTrace(
            sql="SELECT * FROM test_table_data",
            cohort_on="'test'",
            source="test_db",
            source_type="sqlite",
            columns=["x", "row", "value"],
            select_items={"x": "x", "row": "row", "total": "SUM(value)"},
            filter_by={},
            referenced_models=["test table", "waterfall_model_duckdb"],
        )

        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)
        sql = builder.build()

        print(f"Generated SQL with space in model name:\n{sql}")

        # The SQL should NOT contain "test table" as an identifier
        assert "test table." not in sql
        assert '"test table"' not in sql

        # Should have sanitized names
        assert "_cte" in sql  # Should have CTE aliases
        assert "JOIN" in sql.upper()

        # The join condition should work with sanitized names
        assert ".x = " in sql
        assert ".row" in sql

    def test_model_with_special_characters(self):
        """Test model names with various special characters."""
        # Model with hyphens and dots
        model1 = SqlModel(
            name="my-model.v2", sql="SELECT * FROM model_v2_data", source="ref(test_db)"
        )

        # Model with parentheses
        model2 = SqlModel(
            name="sales (2024)", sql="SELECT * FROM sales_2024", source="ref(test_db)"
        )

        # Need to quote model names with special characters
        relation = Relation(
            name="special_chars_relation",
            condition="${ref('my-model.v2').id} = ${ref('sales (2024)').model_id}",
            join_type="inner",
        )

        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")

        project = Project(
            name="test_project", sources=[source], models=[model1, model2], relations=[relation]
        )

        tokenized = TokenizedTrace(
            sql="SELECT * FROM model_v2_data",
            cohort_on="'test'",
            source="test_db",
            source_type="sqlite",
            columns=["id", "model_id", "amount"],
            select_items={"id": "id", "total": "SUM(amount)"},
            filter_by={},
            referenced_models=["my-model.v2", "sales (2024)"],
        )

        builder = SqlglotQueryBuilder(tokenized_trace=tokenized, project=project)
        sql = builder.build()

        print(f"Generated SQL with special characters:\n{sql}")

        # Should not contain the problematic characters directly
        assert "my-model.v2" not in sql
        assert "sales (2024)" not in sql

        # Should have valid SQL
        assert "WITH" in sql.upper()
        assert "JOIN" in sql.upper()
        assert "_cte" in sql

    def test_sanitization_consistency(self):
        """Test that the same model name always produces the same sanitized name."""
        # Create a minimal project for testing
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")
        project = Project(name="test_project", sources=[source], models=[])

        builder = SqlglotQueryBuilder(
            tokenized_trace=TokenizedTrace(
                sql="SELECT * FROM test",
                cohort_on="'test'",
                source="test",
                source_type="sqlite",
                columns=[],
                select_items={},
            ),
            project=project,
        )

        # Test multiple calls return the same result
        name1 = builder._sanitize_model_name("test table")
        name2 = builder._sanitize_model_name("test table")
        assert name1 == name2

        # Test caching works
        alias1 = builder._get_model_alias("my model (v2)")
        alias2 = builder._get_model_alias("my model (v2)")
        assert alias1 == alias2

        # Test different names produce different results
        name3 = builder._sanitize_model_name("different table")
        assert name3 != name1

    def test_already_valid_names_unchanged(self):
        """Test that already SQL-compliant names are not changed."""
        # Create a minimal project for testing
        source = SqliteSource(name="test_db", type="sqlite", database=":memory:")
        project = Project(name="test_project", sources=[source], models=[])

        builder = SqlglotQueryBuilder(
            tokenized_trace=TokenizedTrace(
                sql="SELECT * FROM test",
                cohort_on="'test'",
                source="test",
                source_type="sqlite",
                columns=[],
                select_items={},
            ),
            project=project,
        )

        # These should remain unchanged
        assert builder._sanitize_model_name("orders") == "orders"
        assert builder._sanitize_model_name("user_accounts") == "user_accounts"
        assert builder._sanitize_model_name("OrderItems123") == "OrderItems123"

        # These need sanitization
        assert builder._sanitize_model_name("order-items") != "order-items"
        assert builder._sanitize_model_name("user.accounts") != "user.accounts"
        assert builder._sanitize_model_name("sales (monthly)") != "sales (monthly)"
