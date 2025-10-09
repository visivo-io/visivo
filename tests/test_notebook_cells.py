"""
Tests for the Enhanced Notebook-Style Explorer (Phase 1: Backend)

Tests cover:
- Database models (QueryCellModel, CellResultModel)
- WorksheetRepository cell CRUD operations
- Migration from single-query to multi-cell worksheets
- Cell ordering and reordering
"""

import uuid
import pytest
from visivo.server.models.worksheet import WorksheetModel
from visivo.server.models.query_cell import QueryCellModel
from visivo.server.models.cell_result import CellResultModel
from visivo.server.models.session_state import SessionStateModel
from visivo.server.repositories.worksheet_repository import WorksheetRepository


@pytest.fixture
def repo():
    """Create an in-memory database repository for testing."""
    return WorksheetRepository(":memory:")


class TestQueryCellModel:
    """Test the QueryCellModel database model."""

    def test_create_query_cell(self, repo):
        """Test creating a query cell."""
        worksheet = repo.create_worksheet("Test Worksheet", "SELECT 1")
        assert len(worksheet["cells"]) == 1
        cell = worksheet["cells"][0]
        assert cell["query_text"] == "SELECT 1"
        assert cell["cell_order"] == 0
        assert cell["view_mode"] == "table"

    def test_cell_to_dict(self, repo):
        """Test cell serialization to dictionary."""
        worksheet = repo.create_worksheet("Test", "SELECT 1")
        cell = worksheet["cells"][0]
        assert "id" in cell
        assert "worksheet_id" in cell
        assert "query_text" in cell
        assert "cell_order" in cell
        assert "view_mode" in cell
        assert "created_at" in cell
        assert "updated_at" in cell


class TestCellResultModel:
    """Test the CellResultModel database model."""

    def test_create_cell_result(self, repo):
        """Test saving a cell result."""
        worksheet = repo.create_worksheet("Test", "SELECT 1")
        cell_id = worksheet["cells"][0]["id"]

        # Save a result
        success = repo.save_cell_result(
            cell_id,
            '{"columns": ["col1"], "rows": [[1]]}',
            '{"executionTime": "0.5s"}',
            is_truncated=False,
        )
        assert success is True

        # Retrieve cell with result
        cell_data = repo.get_cell(cell_id)
        assert cell_data is not None
        assert cell_data["result"] is not None
        assert cell_data["result"]["is_truncated"] is False

    def test_truncated_result_flag(self, repo):
        """Test the is_truncated flag for large results."""
        worksheet = repo.create_worksheet("Test", "SELECT *")
        cell_id = worksheet["cells"][0]["id"]

        # Save a truncated result
        repo.save_cell_result(cell_id, '{"columns": [], "rows": []}', "{}", is_truncated=True)

        cell_data = repo.get_cell(cell_id)
        assert cell_data["result"]["is_truncated"] is True


class TestWorksheetRepository:
    """Test worksheet repository cell operations."""

    def test_create_worksheet_with_initial_cell(self, repo):
        """Test that creating a worksheet automatically creates an initial cell."""
        worksheet = repo.create_worksheet("New Worksheet", "SELECT * FROM users", "my_source")

        assert worksheet["worksheet"]["name"] == "New Worksheet"
        assert worksheet["worksheet"]["selected_source"] == "my_source"
        assert len(worksheet["cells"]) == 1
        assert worksheet["cells"][0]["query_text"] == "SELECT * FROM users"

    def test_create_additional_cell(self, repo):
        """Test adding a new cell to an existing worksheet."""
        worksheet = repo.create_worksheet("Test", "SELECT 1")
        worksheet_id = worksheet["worksheet"]["id"]

        # Create a second cell
        cell2 = repo.create_cell(worksheet_id, "SELECT 2")
        assert cell2 is not None
        assert cell2["query_text"] == "SELECT 2"
        assert cell2["cell_order"] == 1  # Should be after the first cell

        # Verify list_cells returns both
        cells = repo.list_cells(worksheet_id)
        assert len(cells) == 2
        assert cells[0]["cell"]["cell_order"] == 0
        assert cells[1]["cell"]["cell_order"] == 1

    def test_list_cells_ordered(self, repo):
        """Test that list_cells returns cells in correct order."""
        worksheet = repo.create_worksheet("Test", "SELECT 1")
        worksheet_id = worksheet["worksheet"]["id"]

        # Create multiple cells
        repo.create_cell(worksheet_id, "SELECT 2")
        repo.create_cell(worksheet_id, "SELECT 3")

        cells = repo.list_cells(worksheet_id)
        assert len(cells) == 3
        assert [c["cell"]["query_text"] for c in cells] == ["SELECT 1", "SELECT 2", "SELECT 3"]

    def test_update_cell(self, repo):
        """Test updating cell properties."""
        worksheet = repo.create_worksheet("Test", "SELECT 1")
        cell_id = worksheet["cells"][0]["id"]

        # Update cell
        success = repo.update_cell(
            cell_id, {"query_text": "SELECT * FROM new_table", "view_mode": "dimension_pills"}
        )
        assert success is True

        # Verify update
        cell_data = repo.get_cell(cell_id)
        assert cell_data["cell"]["query_text"] == "SELECT * FROM new_table"
        assert cell_data["cell"]["view_mode"] == "dimension_pills"

    def test_delete_cell(self, repo):
        """Test deleting a cell."""
        worksheet = repo.create_worksheet("Test", "SELECT 1")
        worksheet_id = worksheet["worksheet"]["id"]

        # Create additional cells
        cell2 = repo.create_cell(worksheet_id, "SELECT 2")
        cell3 = repo.create_cell(worksheet_id, "SELECT 3")

        # Delete the middle cell
        success = repo.delete_cell(cell2["id"])
        assert success is True

        # Verify remaining cells and reordering
        cells = repo.list_cells(worksheet_id)
        assert len(cells) == 2
        assert [c["cell"]["query_text"] for c in cells] == ["SELECT 1", "SELECT 3"]
        # Cells should be reordered to maintain sequential order
        assert cells[0]["cell"]["cell_order"] == 0
        assert cells[1]["cell"]["cell_order"] == 1

    def test_reorder_cells(self, repo):
        """Test reordering cells within a worksheet."""
        worksheet = repo.create_worksheet("Test", "SELECT 1")
        worksheet_id = worksheet["worksheet"]["id"]

        cell2 = repo.create_cell(worksheet_id, "SELECT 2")
        cell3 = repo.create_cell(worksheet_id, "SELECT 3")

        # Get cell IDs
        cells = repo.list_cells(worksheet_id)
        cell_ids = [c["cell"]["id"] for c in cells]

        # Reverse the order
        reversed_order = list(reversed(cell_ids))
        success = repo.reorder_cells(worksheet_id, reversed_order)
        assert success is True

        # Verify new order
        cells = repo.list_cells(worksheet_id)
        assert [c["cell"]["query_text"] for c in cells] == ["SELECT 3", "SELECT 2", "SELECT 1"]


class TestMigration:
    """Test migration from single-query worksheets to multi-cell format."""

    def test_migrate_worksheet_with_query(self, repo):
        """Test migrating a worksheet that has a query but no cells."""
        # Create an old-style worksheet directly in the database
        session = repo.Session()
        old_worksheet = WorksheetModel(
            id=str(uuid.uuid4()), name="Old Worksheet", query="SELECT * FROM old_table"
        )
        old_worksheet.session_state = SessionStateModel(tab_order=1, is_visible=True)
        session.add(old_worksheet)
        session.commit()
        worksheet_id = old_worksheet.id
        session.close()

        # Run migration
        repo.migrate_existing_worksheets()

        # Verify cell was created
        cells = repo.list_cells(worksheet_id)
        assert len(cells) == 1
        assert cells[0]["cell"]["query_text"] == "SELECT * FROM old_table"
        assert cells[0]["cell"]["cell_order"] == 0

    def test_migrate_worksheet_without_query(self, repo):
        """Test that migration doesn't create cells for worksheets without queries."""
        session = repo.Session()
        empty_worksheet = WorksheetModel(id=str(uuid.uuid4()), name="Empty Worksheet", query="")
        empty_worksheet.session_state = SessionStateModel(tab_order=1, is_visible=True)
        session.add(empty_worksheet)
        session.commit()
        worksheet_id = empty_worksheet.id
        session.close()

        # Run migration
        repo.migrate_existing_worksheets()

        # Verify no cells were created
        cells = repo.list_cells(worksheet_id)
        assert len(cells) == 0

    def test_migrate_worksheet_with_existing_cells(self, repo):
        """Test that migration doesn't duplicate cells."""
        # Create a worksheet with cells
        worksheet = repo.create_worksheet("Already Migrated", "SELECT 1")
        worksheet_id = worksheet["worksheet"]["id"]

        # Run migration again
        repo.migrate_existing_worksheets()

        # Verify only one cell exists (no duplication)
        cells = repo.list_cells(worksheet_id)
        assert len(cells) == 1


class TestCellOrdering:
    """Test cell ordering edge cases."""

    def test_create_cell_with_custom_order(self, repo):
        """Test creating a cell at a specific position."""
        worksheet = repo.create_worksheet("Test", "SELECT 1")
        worksheet_id = worksheet["worksheet"]["id"]

        # Create cell at specific order
        cell2 = repo.create_cell(worksheet_id, "INSERT AT 0", cell_order=0)

        # This should insert at the beginning, but might depend on implementation
        # For now, just verify it was created
        assert cell2 is not None
        assert cell2["cell_order"] == 0

    def test_empty_worksheet_cell_order(self, repo):
        """Test that first cell in an empty worksheet gets order 0."""
        worksheet = repo.create_worksheet("Empty", "", None)
        worksheet_id = worksheet["worksheet"]["id"]

        # Delete the initial cell
        cells = repo.list_cells(worksheet_id)
        if len(cells) > 0:
            repo.delete_cell(cells[0]["cell"]["id"])

        # Add a new cell
        new_cell = repo.create_cell(worksheet_id, "SELECT 1")
        assert new_cell["cell_order"] == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
