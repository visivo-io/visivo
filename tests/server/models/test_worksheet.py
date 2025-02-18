import pytest
from datetime import datetime
from visivo.server.models.worksheet import WorksheetModel
from visivo.server.models.session_state import SessionStateModel
from visivo.server.models.result import ResultModel

def test_worksheet_creation(session):
    """Test creating a WorksheetModel instance."""
    worksheet = WorksheetModel(
        id="test-id",
        name="Test Worksheet",
        query="SELECT * FROM test",
        selected_source="test_source"
    )
    session.add(worksheet)
    session.commit()

    # Test retrieval
    retrieved = session.query(WorksheetModel).first()
    assert retrieved.id == "test-id"
    assert retrieved.name == "Test Worksheet"
    assert retrieved.query == "SELECT * FROM test"
    assert retrieved.selected_source == "test_source"
    assert isinstance(retrieved.created_at, datetime)
    assert isinstance(retrieved.updated_at, datetime)
    assert retrieved.last_run_at is None

def test_worksheet_to_dict(session):
    """Test the to_dict method of WorksheetModel."""
    now = datetime.utcnow()
    worksheet = WorksheetModel(
        id="test-id",
        name="Test Worksheet",
        query="SELECT * FROM test",
        selected_source="test_source",
        created_at=now,
        updated_at=now,
        last_run_at=now
    )
    session.add(worksheet)
    session.commit()

    data = worksheet.to_dict()
    assert data["id"] == "test-id"
    assert data["name"] == "Test Worksheet"
    assert data["query"] == "SELECT * FROM test"
    assert data["selected_source"] == "test_source"
    assert isinstance(data["created_at"], str)
    assert isinstance(data["updated_at"], str)
    assert isinstance(data["last_run_at"], str)

def test_worksheet_relationships(session):
    """Test WorksheetModel relationships with SessionState and Results."""
    
    worksheet = WorksheetModel(
        id="test-id",
        name="Test Worksheet"
    )
    
    # Add session state
    session_state = SessionStateModel(
        worksheet=worksheet,
        tab_order=1,
        is_visible=True
    )
    
    # Add results
    result1 = ResultModel(
        worksheet=worksheet,
        results_json='{"data": "test1"}',
        query_stats_json='{"stats": "test1"}'
    )
    result2 = ResultModel(
        worksheet=worksheet,
        results_json='{"data": "test2"}',
        query_stats_json='{"stats": "test2"}'
    )
    
    session.add(worksheet)
    session.commit()

    # Test relationships
    retrieved = session.query(WorksheetModel).first()
    assert retrieved.session_state.tab_order == 1
    assert len(retrieved.results) == 2
    assert retrieved.results[0].results_json == '{"data": "test1"}'
    assert retrieved.results[1].results_json == '{"data": "test2"}'

def test_worksheet_cascade_delete(session):
    """Test that deleting a worksheet cascades to related models."""
    
    
    worksheet = WorksheetModel(
        id="test-id",
        name="Test Worksheet"
    )
    session_state = SessionStateModel(
        worksheet=worksheet,
        tab_order=1,
        is_visible=True
    )
    result = ResultModel(
        worksheet=worksheet,
        results_json='{"data": "test"}',
        query_stats_json='{"stats": "test"}'
    )
    
    session.add(worksheet)
    session.commit()

    # Delete worksheet
    session.delete(worksheet)
    session.commit()

    # Verify cascade delete
    assert session.query(WorksheetModel).count() == 0
    assert session.query(SessionStateModel).count() == 0
    assert session.query(ResultModel).count() == 0 