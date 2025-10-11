"""Tests for worksheet repository schema migration."""

import pytest
import sqlite3
from visivo.server.repositories.worksheet_repository import WorksheetRepository


def test_schema_migration_from_old_database(empty_db_path):
    """Test that old database schema is automatically migrated."""
    # Create an old database with the old schema (missing selected_source column)
    conn = sqlite3.connect(empty_db_path)
    cursor = conn.cursor()

    # Create old schema tables
    cursor.execute(
        """
        CREATE TABLE worksheets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TIMESTAMP,
            updated_at TIMESTAMP
        )
    """
    )

    cursor.execute(
        """
        CREATE TABLE session_states (
            id INTEGER PRIMARY KEY,
            worksheet_id TEXT NOT NULL,
            tab_order INTEGER NOT NULL,
            is_visible BOOLEAN NOT NULL,
            FOREIGN KEY (worksheet_id) REFERENCES worksheets(id)
        )
    """
    )

    # Create old query_cells table WITHOUT selected_source column
    cursor.execute(
        """
        CREATE TABLE query_cells (
            id TEXT PRIMARY KEY,
            worksheet_id TEXT NOT NULL,
            query_text TEXT,
            cell_order INTEGER NOT NULL,
            view_mode TEXT,
            created_at TIMESTAMP,
            updated_at TIMESTAMP,
            FOREIGN KEY (worksheet_id) REFERENCES worksheets(id)
        )
    """
    )

    # Insert some old data
    cursor.execute(
        "INSERT INTO worksheets (id, name) VALUES (?, ?)", ("test-worksheet-id", "Old Worksheet")
    )
    cursor.execute(
        "INSERT INTO session_states (worksheet_id, tab_order, is_visible) VALUES (?, ?, ?)",
        ("test-worksheet-id", 1, True),
    )
    cursor.execute(
        "INSERT INTO query_cells (id, worksheet_id, query_text, cell_order, view_mode) "
        "VALUES (?, ?, ?, ?, ?)",
        ("test-cell-id", "test-worksheet-id", "SELECT 1", 0, "table"),
    )

    conn.commit()
    conn.close()

    # Now initialize the repository - it should detect old schema and recreate
    repository = WorksheetRepository(empty_db_path)

    # Verify that we can now query with selected_source column
    # This would fail if migration didn't work
    cells = repository.list_cells("test-worksheet-id")

    # Old data should be gone after migration (database was recreated)
    assert len(cells) == 0

    # But we should be able to create new worksheets with the new schema
    result = repository.create_worksheet(name="New Worksheet")
    assert result is not None
    assert result["worksheet"]["name"] == "New Worksheet"

    # And cells should have selected_source field
    cell_id = result["cells"][0]["id"]
    repository.update_cell(cell_id, {"selected_source": "test_source"})

    cell_data = repository.get_cell(cell_id)
    assert cell_data["cell"]["selected_source"] == "test_source"
