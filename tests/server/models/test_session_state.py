import pytest
from visivo.server.models import SessionStateModel, WorksheetModel

def test_session_state_creation(session):
    """Test creating a SessionStateModel instance."""
    worksheet = WorksheetModel(id="test-id", name="Test Worksheet")
    session_state = SessionStateModel(
        worksheet=worksheet,
        tab_order=1,
        is_visible=True
    )
    session.add(worksheet)
    session.add(session_state)
    session.commit()

    # Test retrieval
    retrieved = session.query(SessionStateModel).first()
    assert retrieved.worksheet_id == "test-id"
    assert retrieved.tab_order == 1
    assert retrieved.is_visible is True

def test_session_state_to_dict(session):
    """Test the to_dict method of SessionStateModel."""
    worksheet = WorksheetModel(id="test-id", name="Test Worksheet")
    session_state = SessionStateModel(
        worksheet=worksheet,
        tab_order=1,
        is_visible=True
    )
    session.add(worksheet)
    session.add(session_state)
    session.commit()

    data = session_state.to_dict()
    assert data["worksheet_id"] == "test-id"
    assert data["tab_order"] == 1
    assert data["is_visible"] is True

def test_session_state_worksheet_relationship(session):
    """Test SessionStateModel relationship with Worksheet."""
    worksheet = WorksheetModel(id="test-id", name="Test Worksheet")
    session_state = SessionStateModel(
        worksheet=worksheet,
        tab_order=1,
        is_visible=True
    )
    session.add(worksheet)
    session.add(session_state)
    session.commit()

    # Test relationship
    retrieved = session.query(SessionStateModel).first()
    assert retrieved.worksheet.id == "test-id"
    assert retrieved.worksheet.name == "Test Worksheet"

def test_session_state_cascade_delete(session):
    """Test that session state is deleted when worksheet is deleted."""
    worksheet = WorksheetModel(id="test-id", name="Test Worksheet")
    session_state = SessionStateModel(
        worksheet=worksheet,
        tab_order=1,
        is_visible=True
    )
    session.add(worksheet)
    session.add(session_state)
    session.commit()

    # Delete worksheet
    session.delete(worksheet)
    session.commit()

    # Verify cascade delete
    assert session.query(SessionStateModel).count() == 0 