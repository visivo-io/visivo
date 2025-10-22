import pytest
from datetime import datetime
from visivo.server.repositories.worksheet_repository import WorksheetRepository


@pytest.fixture
def repository(db_path):
    """Create a fresh repository instance for each test."""
    return WorksheetRepository(db_path)


def test_create_worksheet(repository):
    """Test creating a new worksheet with session state and initial cell."""
    result = repository.create_worksheet(name="Test Worksheet")

    # Verify worksheet data
    worksheet = result["worksheet"]
    assert worksheet["name"] == "Test Worksheet"
    assert worksheet["id"] is not None

    # Verify session state
    session_state = result["session_state"]
    assert session_state["worksheet_id"] == worksheet["id"]
    assert session_state["tab_order"] == 1
    assert session_state["is_visible"] is True

    # Verify initial cell was created
    cells = result["cells"]
    assert len(cells) == 1
    assert cells[0]["worksheet_id"] == worksheet["id"]
    assert cells[0]["query_text"] == ""
    assert cells[0]["cell_order"] == 0


def test_get_worksheet(repository):
    """Test retrieving a worksheet by ID."""
    # Create a worksheet
    created = repository.create_worksheet(name="Test Worksheet")
    worksheet_id = created["worksheet"]["id"]

    # Retrieve and verify
    result = repository.get_worksheet(worksheet_id)
    assert result is not None
    assert result["worksheet"]["id"] == worksheet_id
    assert result["worksheet"]["name"] == "Test Worksheet"
    assert result["session_state"]["worksheet_id"] == worksheet_id


def test_get_nonexistent_worksheet(repository):
    """Test retrieving a non-existent worksheet."""
    result = repository.get_worksheet("nonexistent-id")
    assert result is None


def test_list_worksheets(repository):
    """Test listing all worksheets ordered by tab order."""
    # Create multiple worksheets
    worksheet1 = repository.create_worksheet(name="Worksheet 1")
    worksheet2 = repository.create_worksheet(name="Worksheet 2")
    worksheet3 = repository.create_worksheet(name="Worksheet 3")

    # List and verify
    worksheets = repository.list_worksheets()
    assert len(worksheets) == 3
    assert worksheets[0]["worksheet"]["name"] == "Worksheet 1"
    assert worksheets[1]["worksheet"]["name"] == "Worksheet 2"
    assert worksheets[2]["worksheet"]["name"] == "Worksheet 3"

    # Verify tab order
    assert worksheets[0]["session_state"]["tab_order"] == 1
    assert worksheets[1]["session_state"]["tab_order"] == 2
    assert worksheets[2]["session_state"]["tab_order"] == 3


def test_update_worksheet(repository):
    """Test updating a worksheet's attributes."""
    # Create a worksheet
    created = repository.create_worksheet(name="Original Name")
    worksheet_id = created["worksheet"]["id"]

    # Update and verify
    success = repository.update_worksheet(worksheet_id, {"name": "Updated Name"})
    assert success is True

    # Verify changes
    updated = repository.get_worksheet(worksheet_id)
    assert updated["worksheet"]["name"] == "Updated Name"


def test_update_nonexistent_worksheet(repository):
    """Test updating a non-existent worksheet."""
    success = repository.update_worksheet("nonexistent-id", {"name": "New Name"})
    assert success is False


def test_update_session_states(repository):
    """Test updating multiple session states."""
    # Create worksheets
    worksheet1 = repository.create_worksheet(name="Worksheet 1")
    worksheet2 = repository.create_worksheet(name="Worksheet 2")

    # Update session states
    states = [
        {"worksheet_id": worksheet1["worksheet"]["id"], "tab_order": 2, "is_visible": False},
        {"worksheet_id": worksheet2["worksheet"]["id"], "tab_order": 1, "is_visible": True},
    ]
    success = repository.update_session_states(states)
    assert success is True

    # Verify changes
    worksheets = repository.list_worksheets()
    assert len(worksheets) == 2
    # Should be ordered by new tab_order
    assert worksheets[0]["worksheet"]["name"] == "Worksheet 2"
    assert worksheets[0]["session_state"]["tab_order"] == 1
    assert worksheets[1]["worksheet"]["name"] == "Worksheet 1"
    assert worksheets[1]["session_state"]["tab_order"] == 2
    assert not worksheets[1]["session_state"]["is_visible"]


def test_delete_worksheet(repository):
    """Test deleting a worksheet and its associated data."""
    # Create a worksheet
    created = repository.create_worksheet(name="Test Worksheet")
    worksheet_id = created["worksheet"]["id"]

    # Delete and verify
    success = repository.delete_worksheet(worksheet_id)
    assert success is True

    # Verify worksheet and associated data are gone
    assert repository.get_worksheet(worksheet_id) is None


def test_delete_nonexistent_worksheet(repository):
    """Test deleting a non-existent worksheet."""
    success = repository.delete_worksheet("nonexistent-id")
    assert success is False


def test_update_worksheet_with_cell_reorder(repository):
    """Test updating a worksheet with cell_order to reorder cells."""
    # Create a worksheet
    created = repository.create_worksheet(name="Test Worksheet")
    worksheet_id = created["worksheet"]["id"]

    # Create additional cells
    cell1_id = created["cells"][0]["id"]  # Initial cell
    cell2 = repository.create_cell(worksheet_id, "SELECT 2", 1)
    cell3 = repository.create_cell(worksheet_id, "SELECT 3", 2)
    cell2_id = cell2["id"]
    cell3_id = cell3["id"]

    # Reorder cells via update_worksheet: [cell3, cell1, cell2]
    new_order = [cell3_id, cell1_id, cell2_id]
    success = repository.update_worksheet(worksheet_id, {"cell_order": new_order})
    assert success is True

    # Verify the new order
    cells = repository.list_cells(worksheet_id)
    assert len(cells) == 3
    assert cells[0]["cell"]["id"] == cell3_id
    assert cells[0]["cell"]["cell_order"] == 0
    assert cells[1]["cell"]["id"] == cell1_id
    assert cells[1]["cell"]["cell_order"] == 1
    assert cells[2]["cell"]["id"] == cell2_id
    assert cells[2]["cell"]["cell_order"] == 2


def test_update_worksheet_with_cell_reorder_and_name(repository):
    """Test updating both worksheet name and cell order simultaneously."""
    # Create a worksheet
    created = repository.create_worksheet(name="Original Name")
    worksheet_id = created["worksheet"]["id"]

    # Create additional cells
    cell1_id = created["cells"][0]["id"]
    cell2 = repository.create_cell(worksheet_id, "SELECT 2", 1)
    cell2_id = cell2["id"]

    # Update both name and cell order
    new_order = [cell2_id, cell1_id]
    success = repository.update_worksheet(
        worksheet_id, {"name": "Updated Name", "cell_order": new_order}
    )
    assert success is True

    # Verify name change
    updated = repository.get_worksheet(worksheet_id)
    assert updated["worksheet"]["name"] == "Updated Name"

    # Verify cell reordering
    cells = repository.list_cells(worksheet_id)
    assert cells[0]["cell"]["id"] == cell2_id
    assert cells[0]["cell"]["cell_order"] == 0
    assert cells[1]["cell"]["id"] == cell1_id
    assert cells[1]["cell"]["cell_order"] == 1
