import pytest
from datetime import datetime
from visivo.utils import get_utc_now
from visivo.server.models.worksheet import WorksheetModel
from visivo.server.models.session_state import SessionStateModel
from visivo.server.models.query_cell import QueryCellModel


def test_worksheet_creation(session):
    """Test creating a WorksheetModel instance."""
    worksheet = WorksheetModel(id="test-id", name="Test Worksheet")
    session.add(worksheet)
    session.commit()

    # Test retrieval
    retrieved = session.query(WorksheetModel).first()
    assert retrieved.id == "test-id"
    assert retrieved.name == "Test Worksheet"
    assert isinstance(retrieved.created_at, datetime)
    assert isinstance(retrieved.updated_at, datetime)


def test_worksheet_to_dict(session):
    """Test the to_dict method of WorksheetModel."""
    now = get_utc_now()
    worksheet = WorksheetModel(
        id="test-id", name="Test Worksheet", created_at=now, updated_at=now
    )
    session.add(worksheet)
    session.commit()

    data = worksheet.to_dict()
    assert data["id"] == "test-id"
    assert data["name"] == "Test Worksheet"
    assert isinstance(data["created_at"], str)
    assert isinstance(data["updated_at"], str)


def test_worksheet_relationships(session):
    """Test WorksheetModel relationships with SessionState and Cells."""

    worksheet = WorksheetModel(id="test-id", name="Test Worksheet")

    # Add session state
    session_state = SessionStateModel(worksheet=worksheet, tab_order=1, is_visible=True)

    # Add cells
    cell1 = QueryCellModel(
        id="cell-1",
        worksheet=worksheet,
        query_text="SELECT 1",
        cell_order=0,
        view_mode="table",
    )
    cell2 = QueryCellModel(
        id="cell-2",
        worksheet=worksheet,
        query_text="SELECT 2",
        cell_order=1,
        view_mode="table",
    )

    session.add(worksheet)
    session.commit()

    # Test relationships
    retrieved = session.query(WorksheetModel).first()
    assert retrieved.session_state.tab_order == 1
    assert len(retrieved.cells) == 2
    assert retrieved.cells[0].query_text == "SELECT 1"
    assert retrieved.cells[1].query_text == "SELECT 2"


def test_worksheet_cascade_delete(session):
    """Test that deleting a worksheet cascades to related models."""

    worksheet = WorksheetModel(id="test-id", name="Test Worksheet")
    session_state = SessionStateModel(worksheet=worksheet, tab_order=1, is_visible=True)
    cell = QueryCellModel(
        id="cell-1",
        worksheet=worksheet,
        query_text="SELECT 1",
        cell_order=0,
        view_mode="table",
    )

    session.add(worksheet)
    session.commit()

    # Delete worksheet
    session.delete(worksheet)
    session.commit()

    # Verify cascade delete
    assert session.query(WorksheetModel).count() == 0
    assert session.query(SessionStateModel).count() == 0
    assert session.query(QueryCellModel).count() == 0
