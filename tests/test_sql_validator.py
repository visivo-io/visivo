"""
Tests for SQLGlot-based SQL validation and classification.
"""

import pytest
from visivo.query.sql_validator import (
    validate_select_query,
    classify_query_ast,
    classify_expression,
    infer_dialect,
    get_sqlglot_dialect,
    extract_groupby_expressions,
    validate_and_classify_trace_sql,
    VISIVO_TO_SQLGLOT
)
from sqlglot import parse_one
from sqlglot.errors import ParseError


class TestDialectMapping:
    """Test dialect name mapping functions."""
    
    def test_get_sqlglot_dialect_valid(self):
        """Test mapping valid Visivo dialects to SQLGlot dialects."""
        assert get_sqlglot_dialect("postgresql") == "postgres"
        assert get_sqlglot_dialect("snowflake") == "snowflake"
        assert get_sqlglot_dialect("bigquery") == "bigquery"
        assert get_sqlglot_dialect("mysql") == "mysql"
        assert get_sqlglot_dialect("sqlite") == "sqlite"
        assert get_sqlglot_dialect("duckdb") == "duckdb"
    
    def test_get_sqlglot_dialect_invalid(self):
        """Test handling of invalid dialect names."""
        assert get_sqlglot_dialect("invalid_dialect") is None
        assert get_sqlglot_dialect("") is None
        assert get_sqlglot_dialect(None) is None
    
    def test_get_sqlglot_dialect_case_insensitive(self):
        """Test that dialect mapping is case insensitive."""
        assert get_sqlglot_dialect("POSTGRESQL") == "postgres"
        assert get_sqlglot_dialect("PostgreSQL") == "postgres"


class TestSQLValidation:
    """Test SQL validation functionality."""
    
    def test_validate_select_query_valid(self):
        """Test validation of valid SELECT queries."""
        sql = "SELECT id, name FROM users"
        ast = validate_select_query(sql)
        assert ast is not None
        
        # Test with dialect
        ast = validate_select_query(sql, "postgres")
        assert ast is not None
    
    def test_validate_select_query_invalid_syntax(self):
        """Test validation of invalid SQL syntax."""
        with pytest.raises(ValueError, match="Invalid SQL syntax"):
            validate_select_query("SELECT FROM")
            
        with pytest.raises(ValueError, match="Invalid SQL syntax"):
            validate_select_query("INVALID SQL QUERY")
    
    def test_validate_select_query_non_select(self):
        """Test rejection of non-SELECT statements."""
        with pytest.raises(ValueError, match="not a SELECT statement"):
            validate_select_query("INSERT INTO users VALUES (1, 'John')")
            
        with pytest.raises(ValueError, match="not a SELECT statement"):
            validate_select_query("CREATE TABLE users (id INT, name VARCHAR(50))")
            
        with pytest.raises(ValueError, match="not a SELECT statement"):
            validate_select_query("UPDATE users SET name = 'Jane' WHERE id = 1")
    
    def test_validate_select_query_complex(self):
        """Test validation of complex SELECT queries."""
        complex_queries = [
            "SELECT u.id, u.name, COUNT(o.id) as order_count FROM users u LEFT JOIN orders o ON u.id = o.user_id GROUP BY u.id, u.name",
            "SELECT * FROM (SELECT id, name FROM users WHERE active = 1) AS active_users",
            "WITH ranked_users AS (SELECT id, name, ROW_NUMBER() OVER (ORDER BY created_at) as rn FROM users) SELECT * FROM ranked_users WHERE rn <= 10"
        ]
        
        for sql in complex_queries:
            ast = validate_select_query(sql)
            assert ast is not None


class TestQueryClassification:
    """Test query classification functionality."""
    
    def test_classify_vanilla_queries(self):
        """Test classification of vanilla (non-aggregate, non-window) queries."""
        vanilla_sqls = [
            "SELECT id, name FROM users",
            "SELECT u.name, u.email FROM users u WHERE u.active = 1",
            "SELECT UPPER(name) as name_upper FROM users"
        ]
        
        for sql in vanilla_sqls:
            ast = parse_one(sql)
            assert classify_query_ast(ast) == "vanilla"
    
    def test_classify_aggregate_queries(self):
        """Test classification of aggregate queries."""
        aggregate_sqls = [
            "SELECT COUNT(*) FROM users",
            "SELECT name, SUM(amount) FROM transactions GROUP BY name",
            "SELECT AVG(price), MAX(price), MIN(price) FROM products"
        ]
        
        for sql in aggregate_sqls:
            ast = parse_one(sql)
            assert classify_query_ast(ast) == "aggregate"
    
    def test_classify_window_queries(self):
        """Test classification of window function queries."""
        window_sqls = [
            "SELECT name, ROW_NUMBER() OVER (ORDER BY created_at) FROM users",
            "SELECT name, SUM(amount) OVER (PARTITION BY user_id) FROM transactions",
            "SELECT id, LAG(price) OVER (ORDER BY date) FROM prices"
        ]
        
        for sql in window_sqls:
            ast = parse_one(sql)
            assert classify_query_ast(ast) == "window"
    
    def test_classify_window_takes_precedence(self):
        """Test that window classification takes precedence over aggregate."""
        sql = "SELECT name, COUNT(*) OVER (PARTITION BY department) FROM users"
        ast = parse_one(sql)
        assert classify_query_ast(ast) == "window"


class TestExpressionClassification:
    """Test individual expression classification."""
    
    def test_classify_expression_vanilla(self):
        """Test classification of vanilla expressions."""
        vanilla_expressions = [
            "user_id",
            "UPPER(name)",
            "price * 1.1",
            "CASE WHEN active THEN 1 ELSE 0 END"
        ]
        
        for expr in vanilla_expressions:
            assert classify_expression(expr) == "vanilla"
    
    def test_classify_expression_aggregate(self):
        """Test classification of aggregate expressions."""
        aggregate_expressions = [
            "COUNT(*)",
            "SUM(amount)",
            "AVG(price)",
            "MAX(created_at)"
        ]
        
        for expr in aggregate_expressions:
            assert classify_expression(expr) == "aggregate"
    
    def test_classify_expression_window(self):
        """Test classification of window expressions."""
        window_expressions = [
            "ROW_NUMBER() OVER (ORDER BY id)",
            "SUM(amount) OVER (PARTITION BY user_id)",
            "LAG(price, 1) OVER (ORDER BY date)"
        ]
        
        for expr in window_expressions:
            assert classify_expression(expr) == "window"
    
    def test_classify_expression_fallback(self):
        """Test that invalid expressions fall back to vanilla."""
        # These should not parse but should fallback gracefully
        invalid_expressions = [
            "INVALID_FUNCTION()",
            "broken syntax here"
        ]
        
        for expr in invalid_expressions:
            result = classify_expression(expr)
            assert result == "vanilla"  # Should fallback gracefully


class TestDialectInference:
    """Test dialect inference functionality."""
    
    def test_infer_dialect_postgres(self):
        """Test inference of PostgreSQL dialect."""
        postgres_sql = "SELECT name FROM users WHERE name ILIKE '%john%'"
        dialect = infer_dialect(postgres_sql)
        assert dialect in ("postgres", "snowflake", "duckdb")  # ILIKE is supported by these
    
    def test_infer_dialect_mysql(self):
        """Test inference of MySQL dialect."""
        mysql_sql = "SELECT name FROM users LIMIT 10"
        dialect = infer_dialect(mysql_sql)
        assert dialect is not None  # Should parse with some dialect
    
    def test_infer_dialect_invalid(self):
        """Test inference with invalid SQL."""
        invalid_sql = "COMPLETELY INVALID SQL"
        dialect = infer_dialect(invalid_sql)
        assert dialect is None


class TestGroupByExtraction:
    """Test GROUP BY expression extraction."""
    
    def test_extract_groupby_from_aggregate_query(self):
        """Test extraction of GROUP BY expressions from aggregate queries."""
        sql = "SELECT user_id, name, COUNT(*) FROM users GROUP BY user_id, name"
        ast = parse_one(sql)
        groupby_exprs = extract_groupby_expressions(ast)
        
        # Should find user_id and name as non-aggregate expressions
        assert len(groupby_exprs) == 2
        assert "user_id" in groupby_exprs
        assert "name" in groupby_exprs
    
    def test_extract_groupby_mixed_expressions(self):
        """Test extraction from queries with mixed aggregate and non-aggregate expressions."""
        sql = "SELECT department, UPPER(name) as name_upper, COUNT(*), AVG(salary) FROM employees"
        ast = parse_one(sql)
        groupby_exprs = extract_groupby_expressions(ast)
        
        # Should find department and UPPER(name) as non-aggregate expressions
        assert len(groupby_exprs) == 2
        # Note: exact string matching may vary by dialect, so we check for key parts
        assert any("department" in expr for expr in groupby_exprs)
        assert any("UPPER" in expr and "name" in expr for expr in groupby_exprs)
    
    def test_extract_groupby_vanilla_query(self):
        """Test extraction from vanilla queries (should return empty)."""
        sql = "SELECT id, name FROM users WHERE active = 1"
        ast = parse_one(sql)
        groupby_exprs = extract_groupby_expressions(ast)
        
        # Vanilla queries don't need GROUP BY
        assert len(groupby_exprs) == 0
    
    def test_extract_groupby_window_query(self):
        """Test extraction from window function queries."""
        sql = "SELECT user_id, name, ROW_NUMBER() OVER (ORDER BY created_at) FROM users"
        ast = parse_one(sql)
        groupby_exprs = extract_groupby_expressions(ast)
        
        # Should find user_id and name as non-window expressions
        assert len(groupby_exprs) == 2
        assert "user_id" in groupby_exprs
        assert "name" in groupby_exprs


class TestCompleteWorkflow:
    """Test the complete validation and classification workflow."""
    
    def test_validate_and_classify_trace_sql_vanilla(self):
        """Test complete workflow with vanilla query."""
        sql = "SELECT id, name FROM users"
        ast, classification, dialect = validate_and_classify_trace_sql(sql, "postgresql")
        
        assert ast is not None
        assert classification == "vanilla"
        assert dialect == "postgres"
    
    def test_validate_and_classify_trace_sql_aggregate(self):
        """Test complete workflow with aggregate query."""
        sql = "SELECT department, COUNT(*) FROM employees GROUP BY department"
        ast, classification, dialect = validate_and_classify_trace_sql(sql, "snowflake")
        
        assert ast is not None
        assert classification == "aggregate"
        assert dialect == "snowflake"
    
    def test_validate_and_classify_trace_sql_window(self):
        """Test complete workflow with window function query."""
        sql = "SELECT name, ROW_NUMBER() OVER (ORDER BY salary DESC) FROM employees"
        ast, classification, dialect = validate_and_classify_trace_sql(sql, "bigquery")
        
        assert ast is not None
        assert classification == "window"
        assert dialect == "bigquery"
    
    def test_validate_and_classify_trace_sql_with_inference(self):
        """Test complete workflow with dialect inference."""
        sql = "SELECT id, name FROM users WHERE active = true"
        ast, classification, dialect = validate_and_classify_trace_sql(sql, None)
        
        assert ast is not None
        assert classification == "vanilla"
        # dialect might be inferred or None, both are acceptable
    
    def test_validate_and_classify_trace_sql_invalid(self):
        """Test complete workflow with invalid SQL."""
        with pytest.raises(ValueError, match="not a SELECT statement"):
            validate_and_classify_trace_sql("INVALID SQL", "postgresql")


class TestBackwardsCompatibility:
    """Test that the new implementation handles legacy cases correctly."""
    
    def test_common_aggregate_functions(self):
        """Test that common aggregate functions are classified correctly."""
        common_aggregates = [
            "COUNT(*)",
            "SUM(amount)",
            "AVG(price)",
            "MAX(date)",
            "MIN(value)",
            "COUNT(DISTINCT user_id)"
        ]
        
        for expr in common_aggregates:
            assert classify_expression(expr) == "aggregate"
    
    def test_common_window_functions(self):
        """Test that common window functions are classified correctly."""
        common_windows = [
            "ROW_NUMBER() OVER (ORDER BY id)",
            "RANK() OVER (PARTITION BY department ORDER BY salary)",
            "LAG(price) OVER (ORDER BY date)",
            "LEAD(value, 1) OVER (ORDER BY sequence)",
            "SUM(amount) OVER (PARTITION BY user_id)"
        ]
        
        for expr in common_windows:
            assert classify_expression(expr) == "window"
    
    def test_dialect_specific_functions(self):
        """Test dialect-specific function handling."""
        # PostgreSQL specific
        postgres_expr = "STRING_AGG(name, ', ')"
        assert classify_expression(postgres_expr, "postgres") == "aggregate"
        
        # Snowflake specific
        snowflake_expr = "LISTAGG(name, ', ')"
        assert classify_expression(snowflake_expr, "snowflake") == "aggregate"