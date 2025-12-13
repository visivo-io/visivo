"""
Integration tests for source get_schema() methods.

These tests create actual databases with known schemas and verify that
the get_schema() method returns the expected SQLGlot schema structure.
"""

import tempfile
import os
import pytest
import duckdb
import sqlite3
from sqlglot.schema import MappingSchema
from sqlglot import exp

from visivo.models.sources.duckdb_source import DuckdbSource
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.sources.csv_source import CSVFileSource
from visivo.models.sources.excel_source import ExcelFileSource


class TestSourceSchemaIntegration:
    """Integration tests for source schema building functionality."""

    def create_test_duckdb_database(self, db_path: str):
        """Create a DuckDB database with a known schema for testing."""
        conn = duckdb.connect(db_path)

        # Create a variety of tables with different data types
        conn.execute(
            """
            CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(255) UNIQUE,
                age INTEGER,
                balance DECIMAL(10,2),
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """
        )

        conn.execute(
            """
            CREATE TABLE products (
                product_id BIGINT PRIMARY KEY,
                product_name TEXT NOT NULL,
                price DOUBLE,
                category VARCHAR(50),
                tags TEXT[]
            )
        """
        )

        conn.execute(
            """
            CREATE TABLE orders (
                order_id UUID PRIMARY KEY,
                user_id INTEGER,
                total_amount DECIMAL(12,2),
                order_date DATE,
                status VARCHAR(20) DEFAULT 'pending'
            )
        """
        )

        # Insert some test data
        conn.execute(
            """
            INSERT INTO users (id, name, email, age, balance, is_active) VALUES
            (1, 'John Doe', 'john@example.com', 30, 1500.50, true),
            (2, 'Jane Smith', 'jane@example.com', 25, 2300.75, false)
        """
        )

        conn.execute(
            """
            INSERT INTO products (product_id, product_name, price, category, tags) VALUES
            (101, 'Laptop', 999.99, 'Electronics', ['computer', 'portable']),
            (102, 'Mouse', 29.99, 'Electronics', ['accessory', 'input'])
        """
        )

        conn.close()

    def create_test_sqlite_database(self, db_path: str):
        """Create a SQLite database with a known schema for testing."""
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # Create tables with various SQLite data types
        cursor.execute(
            """
            CREATE TABLE customers (
                customer_id INTEGER PRIMARY KEY AUTOINCREMENT,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                email TEXT UNIQUE,
                phone VARCHAR(20),
                credit_score INTEGER,
                account_balance REAL,
                is_premium BOOLEAN DEFAULT 0,
                registration_date DATE,
                last_login DATETIME
            )
        """
        )

        cursor.execute(
            """
            CREATE TABLE inventory (
                item_id INTEGER PRIMARY KEY,
                item_name TEXT NOT NULL,
                quantity INTEGER DEFAULT 0,
                unit_price NUMERIC(8,2),
                weight REAL,
                description TEXT,
                is_available BOOLEAN DEFAULT 1
            )
        """
        )

        cursor.execute(
            """
            CREATE TABLE transactions (
                transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
                customer_id INTEGER,
                amount REAL NOT NULL,
                transaction_type TEXT CHECK(transaction_type IN ('credit', 'debit')),
                transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (customer_id) REFERENCES customers (customer_id)
            )
        """
        )

        # Insert test data
        cursor.execute(
            """
            INSERT INTO customers (first_name, last_name, email, phone, credit_score, account_balance, is_premium, registration_date) VALUES
            ('Alice', 'Johnson', 'alice@test.com', '555-1234', 750, 1200.50, 1, '2023-01-15'),
            ('Bob', 'Wilson', 'bob@test.com', '555-5678', 680, 850.25, 0, '2023-02-20')
        """
        )

        cursor.execute(
            """
            INSERT INTO inventory (item_id, item_name, quantity, unit_price, weight, description, is_available) VALUES
            (1, 'Widget A', 100, 19.99, 2.5, 'Standard widget', 1),
            (2, 'Widget B', 50, 35.50, 4.2, 'Premium widget', 1)
        """
        )

        conn.commit()
        conn.close()

    def test_duckdb_source_get_schema_full_database(self):
        """Test DuckDB source get_schema() method with full database introspection."""
        with tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as f:
            db_path = f.name

        # Remove the temporary file so DuckDB can create a proper database
        os.unlink(db_path)

        try:
            # Create test database
            self.create_test_duckdb_database(db_path)

            # Create DuckDB source
            source = DuckdbSource(name="test_duckdb", database=db_path, type="duckdb")

            # Get schema
            schema = source.get_schema()

            # Verify basic structure
            assert isinstance(schema, dict)
            assert "tables" in schema
            assert "sqlglot_schema" in schema
            assert "metadata" in schema

            # Verify metadata
            metadata = schema["metadata"]
            assert metadata["source_type"] == "duckdb"
            assert metadata["total_tables"] == 3
            assert metadata["total_columns"] > 0

            # Verify tables exist
            tables = schema["tables"]
            assert "users" in tables
            assert "products" in tables
            assert "orders" in tables

            # Verify users table schema
            users_table = tables["users"]
            assert "columns" in users_table
            assert "metadata" in users_table

            users_columns = users_table["columns"]
            assert "id" in users_columns
            assert "name" in users_columns
            assert "email" in users_columns
            assert "age" in users_columns
            assert "balance" in users_columns
            assert "is_active" in users_columns
            assert "created_at" in users_columns

            # Verify column details for specific columns
            id_column = users_columns["id"]
            assert id_column["type"] == "INTEGER"
            assert "sqlglot_datatype" in id_column
            assert isinstance(id_column["sqlglot_datatype"], exp.DataType)

            name_column = users_columns["name"]
            assert "VARCHAR" in name_column["type"]
            assert not name_column["nullable"]  # NOT NULL constraint

            balance_column = users_columns["balance"]
            assert "DECIMAL" in balance_column["type"]

            # Verify SQLGlot schema
            sqlglot_schema = schema["sqlglot_schema"]
            assert isinstance(sqlglot_schema, MappingSchema)

            # Verify tables are in SQLGlot schema
            schema_tables = sqlglot_schema.mapping
            assert "users" in schema_tables
            assert "products" in schema_tables
            assert "orders" in schema_tables

            # Verify columns are in SQLGlot schema for users table
            users_schema_columns = schema_tables["users"]
            assert "id" in users_schema_columns
            assert "name" in users_schema_columns
            assert "email" in users_schema_columns

        finally:
            if os.path.exists(db_path):
                os.unlink(db_path)

    def test_duckdb_source_get_schema_filtered_tables(self):
        """Test DuckDB source get_schema() method with table filtering."""
        with tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as f:
            db_path = f.name

        # Remove the temporary file so DuckDB can create a proper database
        os.unlink(db_path)

        try:
            # Create test database
            self.create_test_duckdb_database(db_path)

            # Create DuckDB source
            source = DuckdbSource(name="test_duckdb", database=db_path, type="duckdb")

            # Get schema for specific tables only
            schema = source.get_schema(table_names=["users", "products"])

            # Verify only requested tables are included
            tables = schema["tables"]
            assert "users" in tables
            assert "products" in tables
            assert "orders" not in tables  # Should be filtered out

            # Verify metadata reflects filtered count
            metadata = schema["metadata"]
            assert metadata["total_tables"] == 2

            # Verify SQLGlot schema only includes filtered tables
            sqlglot_schema = schema["sqlglot_schema"]
            schema_tables = sqlglot_schema.mapping
            assert "users" in schema_tables
            assert "products" in schema_tables
            assert "orders" not in schema_tables

        finally:
            if os.path.exists(db_path):
                os.unlink(db_path)

    def test_sqlite_source_get_schema_full_database(self):
        """Test SQLite source get_schema() method with full database introspection."""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name

        try:
            # Create test database
            self.create_test_sqlite_database(db_path)

            # Create SQLite source
            source = SqliteSource(name="test_sqlite", database=db_path, type="sqlite")

            # Get schema
            schema = source.get_schema()

            # Verify basic structure
            assert isinstance(schema, dict)
            assert "tables" in schema
            assert "sqlglot_schema" in schema
            assert "metadata" in schema

            # Verify metadata
            metadata = schema["metadata"]
            assert metadata["total_tables"] == 3
            assert metadata["total_columns"] > 0

            # Verify tables exist
            tables = schema["tables"]
            assert "customers" in tables
            assert "inventory" in tables
            assert "transactions" in tables

            # Verify customers table schema
            customers_table = tables["customers"]
            assert "columns" in customers_table
            assert "metadata" in customers_table

            customers_columns = customers_table["columns"]
            assert "customer_id" in customers_columns
            assert "first_name" in customers_columns
            assert "last_name" in customers_columns
            assert "email" in customers_columns
            assert "phone" in customers_columns
            assert "credit_score" in customers_columns
            assert "account_balance" in customers_columns
            assert "is_premium" in customers_columns
            assert "registration_date" in customers_columns
            assert "last_login" in customers_columns

            # Verify column details for specific columns
            customer_id_column = customers_columns["customer_id"]
            assert "INTEGER" in customer_id_column["type"]
            assert "sqlglot_datatype" in customer_id_column

            first_name_column = customers_columns["first_name"]
            assert "TEXT" in first_name_column["type"]
            assert not first_name_column["nullable"]  # NOT NULL constraint

            account_balance_column = customers_columns["account_balance"]
            assert "REAL" in account_balance_column["type"]

            # Verify SQLGlot schema
            sqlglot_schema = schema["sqlglot_schema"]
            assert isinstance(sqlglot_schema, MappingSchema)

            # Verify tables are in SQLGlot schema
            schema_tables = sqlglot_schema.mapping
            assert "customers" in schema_tables
            assert "inventory" in schema_tables
            assert "transactions" in schema_tables

            # Verify columns are in SQLGlot schema for customers table
            customers_schema_columns = schema_tables["customers"]
            assert "customer_id" in customers_schema_columns
            assert "first_name" in customers_schema_columns
            assert "email" in customers_schema_columns

        finally:
            if os.path.exists(db_path):
                os.unlink(db_path)

    def test_sqlite_source_get_schema_filtered_tables(self):
        """Test SQLite source get_schema() method with table filtering."""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name

        try:
            # Create test database
            self.create_test_sqlite_database(db_path)

            # Create SQLite source
            source = SqliteSource(name="test_sqlite", database=db_path, type="sqlite")

            # Get schema for specific tables only
            schema = source.get_schema(table_names=["customers"])

            # Verify only requested table is included
            tables = schema["tables"]
            assert "customers" in tables
            assert "inventory" not in tables  # Should be filtered out
            assert "transactions" not in tables  # Should be filtered out

            # Verify metadata reflects filtered count
            metadata = schema["metadata"]
            assert metadata["total_tables"] == 1

            # Verify SQLGlot schema only includes filtered table
            sqlglot_schema = schema["sqlglot_schema"]
            schema_tables = sqlglot_schema.mapping
            assert "customers" in schema_tables
            assert "inventory" not in schema_tables
            assert "transactions" not in schema_tables

        finally:
            if os.path.exists(db_path):
                os.unlink(db_path)

    def test_duckdb_source_get_schema_empty_database(self):
        """Test DuckDB source get_schema() method with empty database."""
        with tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as f:
            db_path = f.name

        try:
            # Create empty database
            DuckdbSource.create_empty_database(db_path)

            # Create DuckDB source
            source = DuckdbSource(name="test_empty", database=db_path, type="duckdb")

            # Get schema
            schema = source.get_schema()

            # Verify structure for empty database
            assert isinstance(schema, dict)
            assert "tables" in schema
            assert "sqlglot_schema" in schema
            assert "metadata" in schema

            # Verify empty state
            assert len(schema["tables"]) == 0
            assert len(schema["sqlglot_schema"].mapping) == 0

            metadata = schema["metadata"]
            assert metadata["source_type"] == "duckdb"
            assert metadata["total_tables"] == 0
            assert metadata["total_columns"] == 0

        finally:
            if os.path.exists(db_path):
                os.unlink(db_path)

    def test_sqlite_source_get_schema_empty_database(self):
        """Test SQLite source get_schema() method with empty database."""
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = f.name

        try:
            # Create empty database
            conn = sqlite3.connect(db_path)
            conn.close()

            # Create SQLite source
            source = SqliteSource(name="test_empty", database=db_path, type="sqlite")

            # Get schema
            schema = source.get_schema()

            # Verify structure for empty database
            assert isinstance(schema, dict)
            assert "tables" in schema
            assert "sqlglot_schema" in schema
            assert "metadata" in schema

            # Verify empty state
            assert len(schema["tables"]) == 0
            assert len(schema["sqlglot_schema"].mapping) == 0

            metadata = schema["metadata"]
            assert metadata["total_tables"] == 0
            assert metadata["total_columns"] == 0

        finally:
            if os.path.exists(db_path):
                os.unlink(db_path)

    def test_schema_data_type_accuracy(self):
        """Test that get_schema() accurately represents various data types."""
        with tempfile.NamedTemporaryFile(suffix=".duckdb", delete=False) as f:
            db_path = f.name

        # Remove the temporary file so DuckDB can create a proper database
        os.unlink(db_path)

        try:
            # Create database with various data types
            conn = duckdb.connect(db_path)
            conn.execute(
                """
                CREATE TABLE data_types_test (
                    int_col INTEGER,
                    bigint_col BIGINT,
                    varchar_col VARCHAR(50),
                    text_col TEXT,
                    decimal_col DECIMAL(10,2),
                    double_col DOUBLE,
                    boolean_col BOOLEAN,
                    date_col DATE,
                    timestamp_col TIMESTAMP,
                    uuid_col UUID
                )
            """
            )
            conn.close()

            # Create DuckDB source and get schema
            source = DuckdbSource(name="test_types", database=db_path, type="duckdb")
            schema = source.get_schema()

            # Verify table exists
            assert "data_types_test" in schema["tables"]

            columns = schema["tables"]["data_types_test"]["columns"]

            # Verify each data type is correctly represented
            assert "INTEGER" in columns["int_col"]["type"]
            assert "BIGINT" in columns["bigint_col"]["type"]
            assert "VARCHAR" in columns["varchar_col"]["type"]
            assert "VARCHAR" in columns["text_col"]["type"]  # DuckDB treats TEXT as VARCHAR
            assert "DECIMAL" in columns["decimal_col"]["type"]
            assert "DOUBLE" in columns["double_col"]["type"]
            assert "BOOLEAN" in columns["boolean_col"]["type"]
            assert "DATE" in columns["date_col"]["type"]
            assert "TIMESTAMP" in columns["timestamp_col"]["type"]
            assert "UUID" in columns["uuid_col"]["type"]

            # Verify SQLGlot DataType objects are created
            for col_name, col_info in columns.items():
                assert "sqlglot_datatype" in col_info
                assert isinstance(col_info["sqlglot_datatype"], exp.DataType)
                assert "sqlglot_type_info" in col_info

        finally:
            if os.path.exists(db_path):
                os.unlink(db_path)

    def create_test_csv_file(self, csv_path: str):
        """Create a CSV file with known data for testing."""
        csv_content = """id,name,email,age,balance,is_active
1,John Doe,john@example.com,30,1500.50,true
2,Jane Smith,jane@example.com,25,2300.75,false
3,Bob Wilson,bob@example.com,35,1800.25,true"""

        with open(csv_path, "w", encoding="utf-8") as f:
            f.write(csv_content)

    def create_test_excel_file(self, excel_path: str):
        """Create an Excel file (saved as CSV for DuckDB compatibility) with known data for testing."""
        # For simplicity in testing, we'll create a CSV file with .xlsx extension
        # since the Excel source currently uses read_csv_auto anyway
        excel_content = """product_id,product_name,price,category,in_stock
101,Laptop,999.99,Electronics,true
102,Mouse,29.99,Electronics,true
103,Keyboard,79.99,Electronics,false"""

        with open(excel_path, "w", encoding="utf-8") as f:
            f.write(excel_content)

    def test_csv_source_get_schema_full_file(self):
        """Test CSV source get_schema() method with full file introspection."""
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f:
            csv_path = f.name

        try:
            # Create test CSV file
            self.create_test_csv_file(csv_path)

            # Create CSV source
            source = CSVFileSource(name="test_csv", file=csv_path, type="csv")

            # Get schema
            schema = source.get_schema()

            # Verify basic structure
            assert isinstance(schema, dict)
            assert "tables" in schema
            assert "sqlglot_schema" in schema
            assert "metadata" in schema

            # Verify metadata
            metadata = schema["metadata"]
            assert metadata["source_type"] == "csv"
            assert metadata["total_tables"] >= 0  # Should have at least the CSV view

            # The CSV source should create a view with the source name
            if "test_csv" in schema["tables"]:
                csv_table = schema["tables"]["test_csv"]
                assert "columns" in csv_table

                csv_columns = csv_table["columns"]
                # Verify expected columns from our test CSV
                expected_columns = ["id", "name", "email", "age", "balance", "is_active"]
                for col in expected_columns:
                    assert col in csv_columns, f"Column '{col}' not found in CSV schema"

                # Verify SQLGlot schema includes the table
                sqlglot_schema = schema["sqlglot_schema"]
                assert isinstance(sqlglot_schema, MappingSchema)
                assert "test_csv" in sqlglot_schema.mapping
            else:
                # If we don't find the table, the test should fail to highlight the issue
                assert (
                    False
                ), f"CSV table 'test_csv' not found in schema. Available tables: {list(schema['tables'].keys())}"

        finally:
            if os.path.exists(csv_path):
                os.unlink(csv_path)

    def test_excel_source_get_schema_full_file(self):
        """Test Excel source get_schema() method with full file introspection."""
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            excel_path = f.name

        try:
            # Create test Excel file (as CSV for DuckDB compatibility)
            self.create_test_excel_file(excel_path)

            # Create Excel source
            source = ExcelFileSource(name="test_excel", file=excel_path, type="xls")

            # Get schema
            schema = source.get_schema()

            # Verify basic structure
            assert isinstance(schema, dict)
            assert "tables" in schema
            assert "sqlglot_schema" in schema
            assert "metadata" in schema

            # Verify metadata
            metadata = schema["metadata"]
            assert metadata["source_type"] == "xls"
            assert metadata["total_tables"] >= 0  # Should have at least the Excel view

            # The Excel source should create a view with the source name
            if "test_excel" in schema["tables"]:
                excel_table = schema["tables"]["test_excel"]
                assert "columns" in excel_table

                excel_columns = excel_table["columns"]
                # Verify expected columns from our test Excel file
                expected_columns = ["product_id", "product_name", "price", "category", "in_stock"]
                for col in expected_columns:
                    assert col in excel_columns, f"Column '{col}' not found in Excel schema"

                # Verify SQLGlot schema includes the table
                sqlglot_schema = schema["sqlglot_schema"]
                assert isinstance(sqlglot_schema, MappingSchema)
                assert "test_excel" in sqlglot_schema.mapping
            else:
                # If we don't find the table, the test should fail to highlight the issue
                assert (
                    False
                ), f"Excel table 'test_excel' not found in schema. Available tables: {list(schema['tables'].keys())}"

        finally:
            if os.path.exists(excel_path):
                os.unlink(excel_path)

    def test_csv_source_table_filtering(self):
        """Test CSV source get_schema() method with table filtering."""
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f:
            csv_path = f.name

        try:
            # Create test CSV file
            self.create_test_csv_file(csv_path)

            # Create CSV source
            source = CSVFileSource(name="filtered_csv", file=csv_path, type="csv")

            # Get schema with specific table name (should return the CSV view)
            schema = source.get_schema(table_names=["filtered_csv"])

            # Verify structure
            assert isinstance(schema, dict)

            # Should either contain our table or be empty if filtering is working
            assert len(schema["tables"]) <= 1

            # Get schema with non-existent table name (should return empty)
            schema_empty = source.get_schema(table_names=["nonexistent_table"])
            assert len(schema_empty["tables"]) == 0

        finally:
            if os.path.exists(csv_path):
                os.unlink(csv_path)

    def test_csv_source_with_hyphen_in_name(self):
        """Test CSV source get_schema() method with hyphen in source name."""
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as f:
            csv_path = f.name

        try:
            # Create test CSV file
            self.create_test_csv_file(csv_path)

            # Create CSV source with hyphen in name (this was causing parser errors)
            source = CSVFileSource(name="csv-source", file=csv_path, type="csv")

            # Get schema
            schema = source.get_schema()

            # Verify basic structure
            assert isinstance(schema, dict)
            assert "tables" in schema
            assert "sqlglot_schema" in schema
            assert "metadata" in schema

            # Verify metadata
            metadata = schema["metadata"]
            assert metadata["source_type"] == "csv"
            assert metadata["total_tables"] == 1

            # The CSV source should create a view with the source name (including hyphen)
            assert (
                "csv-source" in schema["tables"]
            ), f"CSV table 'csv-source' not found in schema. Available tables: {list(schema['tables'].keys())}"

            csv_table = schema["tables"]["csv-source"]
            assert "columns" in csv_table

            csv_columns = csv_table["columns"]
            # Verify expected columns from our test CSV
            expected_columns = ["id", "name", "email", "age", "balance", "is_active"]
            for col in expected_columns:
                assert col in csv_columns, f"Column '{col}' not found in CSV schema"

            # Verify SQLGlot schema includes the table
            sqlglot_schema = schema["sqlglot_schema"]
            assert isinstance(sqlglot_schema, MappingSchema)
            assert "csv-source" in sqlglot_schema.mapping

        finally:
            if os.path.exists(csv_path):
                os.unlink(csv_path)

    def test_excel_source_with_hyphen_in_name(self):
        """Test Excel source get_schema() method with hyphen in source name."""
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            excel_path = f.name

        try:
            # Create test Excel file
            self.create_test_excel_file(excel_path)

            # Create Excel source with hyphen in name (this was causing parser errors)
            source = ExcelFileSource(name="excel-source", file=excel_path, type="xls")

            # Get schema
            schema = source.get_schema()

            # Verify basic structure
            assert isinstance(schema, dict)
            assert "tables" in schema
            assert "sqlglot_schema" in schema
            assert "metadata" in schema

            # Verify metadata
            metadata = schema["metadata"]
            assert metadata["source_type"] == "xls"
            assert metadata["total_tables"] == 1

            # The Excel source should create a view with the source name (including hyphen)
            assert (
                "excel-source" in schema["tables"]
            ), f"Excel table 'excel-source' not found in schema. Available tables: {list(schema['tables'].keys())}"

            excel_table = schema["tables"]["excel-source"]
            assert "columns" in excel_table

            excel_columns = excel_table["columns"]
            # Verify expected columns from our test Excel file
            expected_columns = ["product_id", "product_name", "price", "category", "in_stock"]
            for col in expected_columns:
                assert col in excel_columns, f"Column '{col}' not found in Excel schema"

            # Verify SQLGlot schema includes the table (might be quoted due to hyphen)
            sqlglot_schema = schema["sqlglot_schema"]
            assert isinstance(sqlglot_schema, MappingSchema)
            # Check if table is in SQLGlot mapping (may be quoted)
            mapping_keys = list(sqlglot_schema.mapping.keys())
            has_excel_table = "excel-source" in mapping_keys or '"excel-source"' in mapping_keys
            assert (
                has_excel_table
            ), f"Excel table not found in SQLGlot mapping. Keys: {mapping_keys}"

        finally:
            if os.path.exists(excel_path):
                os.unlink(excel_path)
