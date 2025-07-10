#!/usr/bin/env python3
"""Debug script to check what DuckDB returns for database list."""

import duckdb
import os

# Test with the actual database file
db_path = "/Users/jaredjesionek/visivo/Product/visivo/test-projects/integration/test.duckdb"

if os.path.exists(db_path):
    print(f"Testing with database: {db_path}")
    conn = duckdb.connect(db_path, read_only=True)

    # Check what PRAGMA database_list returns
    result = conn.execute("PRAGMA database_list").fetchall()
    print("\nPRAGMA database_list result:")
    for i, row in enumerate(result):
        print(f"  Row {i}: {row}")

    # Also check if the database has schemas
    try:
        schemas = conn.execute("SELECT schema_name FROM information_schema.schemata").fetchall()
        print("\nSchemas found:")
        for schema in schemas:
            print(f"  {schema}")
    except Exception as e:
        print(f"\nNo schemas (expected for DuckDB): {e}")

    # Check tables
    try:
        tables = conn.execute("SHOW TABLES").fetchall()
        print("\nTables found:")
        for table in tables:
            print(f"  {table}")
    except Exception as e:
        print(f"\nError listing tables: {e}")

    conn.close()
else:
    print(f"Database file not found: {db_path}")
