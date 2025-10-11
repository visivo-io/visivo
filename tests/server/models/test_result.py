import pytest
from datetime import datetime
from visivo.utils import get_utc_now
from visivo.server.models.worksheet import WorksheetModel
from visivo.server.models.query_cell import QueryCellModel
from visivo.server.models.cell_result import CellResultModel


def test_result_creation(session):
    """Test creating a CellResultModel instance."""
    worksheet = WorksheetModel(id="test-ws-id", name="Test Worksheet")
    cell = QueryCellModel(
        id="test-cell-id", worksheet_id="test-ws-id", query_text="SELECT 1", cell_order=0
    )
    result = CellResultModel(
        cell_id="test-cell-id",
        results_json='{"data": "test"}',
        query_stats_json='{"stats": "test"}',
    )
    session.add(worksheet)
    session.add(cell)
    session.add(result)
    session.commit()

    # Test retrieval
    retrieved = session.query(CellResultModel).first()
    assert retrieved.cell_id == "test-cell-id"
    assert retrieved.results_json == '{"data": "test"}'
    assert retrieved.query_stats_json == '{"stats": "test"}'
    assert isinstance(retrieved.created_at, datetime)


def test_result_to_dict(session):
    """Test the to_dict method of CellResultModel."""
    now = get_utc_now()
    worksheet = WorksheetModel(id="test-ws-id", name="Test Worksheet")
    cell = QueryCellModel(
        id="test-cell-id", worksheet_id="test-ws-id", query_text="SELECT 1", cell_order=0
    )
    result = CellResultModel(
        cell_id="test-cell-id",
        results_json='{"data": "test"}',
        query_stats_json='{"stats": "test"}',
        created_at=now,
    )
    session.add(worksheet)
    session.add(cell)
    session.add(result)
    session.commit()

    data = result.to_dict()
    assert data["results_json"] == '{"data": "test"}'
    assert data["query_stats_json"] == '{"stats": "test"}'
    assert isinstance(data["created_at"], str)


def test_result_cell_relationship(session):
    """Test CellResultModel relationship with QueryCell."""
    worksheet = WorksheetModel(id="test-ws-id", name="Test Worksheet")
    cell = QueryCellModel(
        id="test-cell-id", worksheet_id="test-ws-id", query_text="SELECT 1", cell_order=0
    )
    result = CellResultModel(
        cell_id="test-cell-id",
        results_json='{"data": "test"}',
        query_stats_json='{"stats": "test"}',
    )
    session.add(worksheet)
    session.add(cell)
    session.add(result)
    session.commit()

    # Test relationship
    retrieved = session.query(CellResultModel).first()
    assert retrieved.cell.id == "test-cell-id"
    assert retrieved.cell.query_text == "SELECT 1"


def test_result_cascade_delete(session):
    """Test that results are deleted when cell is deleted."""
    worksheet = WorksheetModel(id="test-ws-id", name="Test Worksheet")
    cell = QueryCellModel(
        id="test-cell-id", worksheet_id="test-ws-id", query_text="SELECT 1", cell_order=0
    )
    result1 = CellResultModel(
        cell_id="test-cell-id",
        results_json='{"data": "test1"}',
        query_stats_json='{"stats": "test1"}',
    )
    result2 = CellResultModel(
        cell_id="test-cell-id",
        results_json='{"data": "test2"}',
        query_stats_json='{"stats": "test2"}',
    )
    session.add(worksheet)
    session.add(cell)
    session.add(result1)
    session.add(result2)
    session.commit()

    # Verify results were created
    assert session.query(CellResultModel).count() == 2

    # Delete cell
    session.delete(cell)
    session.commit()

    # Verify cascade delete
    assert session.query(CellResultModel).count() == 0


def test_multiple_results_ordering(session):
    """Test that results are ordered by created_at."""
    worksheet = WorksheetModel(id="test-ws-id", name="Test Worksheet")
    cell = QueryCellModel(
        id="test-cell-id", worksheet_id="test-ws-id", query_text="SELECT 1", cell_order=0
    )
    result1 = CellResultModel(
        cell_id="test-cell-id",
        results_json='{"data": "test1"}',
        query_stats_json='{"stats": "test1"}',
    )
    result2 = CellResultModel(
        cell_id="test-cell-id",
        results_json='{"data": "test2"}',
        query_stats_json='{"stats": "test2"}',
    )
    session.add(worksheet)
    session.add(cell)
    session.add(result1)
    session.add(result2)
    session.commit()

    # Query results ordered by created_at
    results = session.query(CellResultModel).order_by(CellResultModel.created_at).all()
    assert len(results) == 2
    assert results[0].results_json == '{"data": "test1"}'
    assert results[1].results_json == '{"data": "test2"}'
