import pytest
from datetime import datetime
from visivo.server.repositories.worksheet_repository import WorksheetRepository

@pytest.fixture
def repository(db_path):
    """Create a fresh repository instance for each test."""
    return WorksheetRepository(db_path)

def test_create_worksheet(repository):
    """Test creating a new worksheet with session state."""
    result = repository.create_worksheet(
        name="Test Worksheet",
        query="SELECT * FROM test",
        selected_source="test_source"
    )
    
    # Verify worksheet data
    worksheet = result["worksheet"]
    assert worksheet["name"] == "Test Worksheet"
    assert worksheet["query"] == "SELECT * FROM test"
    assert worksheet["selected_source"] == "test_source"
    assert worksheet["id"] is not None
    
    # Verify session state
    session_state = result["session_state"]
    assert session_state["worksheet_id"] == worksheet["id"]
    assert session_state["tab_order"] == 1
    assert session_state["is_visible"] is True

def test_get_worksheet(repository):
    """Test retrieving a worksheet by ID."""
    # Create a worksheet
    created = repository.create_worksheet(name="Test Worksheet")
    worksheet_id = created["worksheet"]["id"]
    
    # Add a result
    repository.save_results(
        worksheet_id,
        results_json='{"data": "test"}',
        query_stats_json='{"stats": "test"}'
    )
    
    # Retrieve and verify
    result = repository.get_worksheet(worksheet_id)
    assert result is not None
    assert result["worksheet"]["id"] == worksheet_id
    assert result["worksheet"]["name"] == "Test Worksheet"
    assert result["session_state"]["worksheet_id"] == worksheet_id
    assert result["results"]["results_json"] == '{"data": "test"}'

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
    success = repository.update_worksheet(worksheet_id, {
        "name": "Updated Name",
        "query": "SELECT * FROM updated",
        "selected_source": "new_source"
    })
    assert success is True
    
    # Verify changes
    updated = repository.get_worksheet(worksheet_id)
    assert updated["worksheet"]["name"] == "Updated Name"
    assert updated["worksheet"]["query"] == "SELECT * FROM updated"
    assert updated["worksheet"]["selected_source"] == "new_source"

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
        {
            "worksheet_id": worksheet1["worksheet"]["id"],
            "tab_order": 2,
            "is_visible": False
        },
        {
            "worksheet_id": worksheet2["worksheet"]["id"],
            "tab_order": 1,
            "is_visible": True
        }
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

def test_save_results(repository):
    """Test saving query results for a worksheet."""
    # Create a worksheet
    created = repository.create_worksheet(name="Test Worksheet")
    worksheet_id = created["worksheet"]["id"]
    
    # Save results
    success = repository.save_results(
        worksheet_id,
        results_json='{"data": "test"}',
        query_stats_json='{"stats": "test"}'
    )
    assert success is True
    
    # Verify results were saved
    worksheet = repository.get_worksheet(worksheet_id)
    assert worksheet["results"]["results_json"] == '{"data": "test"}'
    assert worksheet["results"]["query_stats_json"] == '{"stats": "test"}'
    assert worksheet["worksheet"]["last_run_at"] is not None

def test_save_results_nonexistent_worksheet(repository):
    """Test saving results for a non-existent worksheet."""
    success = repository.save_results(
        "nonexistent-id",
        results_json='{"data": "test"}',
        query_stats_json='{"stats": "test"}'
    )
    assert success is False

def test_delete_worksheet(repository):
    """Test deleting a worksheet and its associated data."""
    # Create a worksheet with results
    created = repository.create_worksheet(name="Test Worksheet")
    worksheet_id = created["worksheet"]["id"]
    
    repository.save_results(
        worksheet_id,
        results_json='{"data": "test"}',
        query_stats_json='{"stats": "test"}'
    )
    
    # Delete and verify
    success = repository.delete_worksheet(worksheet_id)
    assert success is True
    
    # Verify worksheet and associated data are gone
    assert repository.get_worksheet(worksheet_id) is None

def test_delete_nonexistent_worksheet(repository):
    """Test deleting a non-existent worksheet."""
    success = repository.delete_worksheet("nonexistent-id")
    assert success is False 