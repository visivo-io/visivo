"""Seed the fakesnow emulator with test data.

Usage: python tests/setup/seed_fakesnow.py [--host HOST] [--port PORT]
"""

import argparse
import sys
import time

import snowflake.connector


def seed(host="localhost", port=12345, retries=10, delay=3):
    sql_file = "tests/setup/populate_ci_snowflake.sql"

    for attempt in range(retries):
        try:
            conn = snowflake.connector.connect(
                user="test",
                password="test",
                account="test",
                host=host,
                port=port,
                protocol="http",
            )
            break
        except Exception as e:
            if attempt < retries - 1:
                print(f"Connection attempt {attempt + 1} failed, retrying in {delay}s...")
                time.sleep(delay)
            else:
                print(f"Failed to connect after {retries} attempts: {e}")
                sys.exit(1)

    cur = conn.cursor()
    with open(sql_file) as f:
        for stmt in f.read().split(";"):
            stmt = stmt.strip()
            if stmt:
                cur.execute(stmt)

    # Verify
    cur.execute("USE DATABASE JARED_DEV")
    cur.execute("USE SCHEMA DEFAULT")
    cur.execute("SELECT COUNT(*) FROM test_table")
    count = cur.fetchone()[0]
    print(f"Seeded fakesnow: test_table has {count} rows")

    cur.close()
    conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=12345)
    args = parser.parse_args()
    seed(host=args.host, port=args.port)
