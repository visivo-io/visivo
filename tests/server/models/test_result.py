import pytest
from datetime import datetime
from visivo.utils import get_utc_now
from visivo.server.models.worksheet import WorksheetModel
from visivo.server.models.result import ResultModel


def test_result_creation(session):
    """Test creating a ResultModel instance."""
    worksheet = WorksheetModel(id="test-id", name="Test Worksheet")
    result = ResultModel(
        worksheet=worksheet, results_json='{"data": "test"}', query_stats_json='{"stats": "test"}'
    )
    session.add(worksheet)
    session.add(result)
    session.commit()

    # Test retrieval
    retrieved = session.query(ResultModel).first()
    assert retrieved.worksheet_id == "test-id"
    assert retrieved.results_json == '{"data": "test"}'
    assert retrieved.query_stats_json == '{"stats": "test"}'
    assert isinstance(retrieved.created_at, datetime)


def test_result_to_dict(session):
    """Test the to_dict method of ResultModel."""
    now = get_utc_now()
    worksheet = WorksheetModel(id="test-id", name="Test Worksheet")
    result = ResultModel(
        worksheet=worksheet,
        results_json='{"data": "test"}',
        query_stats_json='{"stats": "test"}',
        created_at=now,
    )
    session.add(worksheet)
    session.add(result)
    session.commit()

    data = result.to_dict()
    assert data["results_json"] == '{"data": "test"}'
    assert data["query_stats_json"] == '{"stats": "test"}'
    assert isinstance(data["created_at"], str)


def test_result_worksheet_relationship(session):
    """Test ResultModel relationship with Worksheet."""
    worksheet = WorksheetModel(id="test-id", name="Test Worksheet")
    result = ResultModel(
        worksheet=worksheet, results_json='{"data": "test"}', query_stats_json='{"stats": "test"}'
    )
    session.add(worksheet)
    session.add(result)
    session.commit()

    # Test relationship
    retrieved = session.query(ResultModel).first()
    assert retrieved.worksheet.id == "test-id"
    assert retrieved.worksheet.name == "Test Worksheet"


def test_result_cascade_delete(session):
    """Test that results are deleted when worksheet is deleted."""
    worksheet = WorksheetModel(id="test-id", name="Test Worksheet")
    result1 = ResultModel(
        worksheet=worksheet, results_json='{"data": "test1"}', query_stats_json='{"stats": "test1"}'
    )
    result2 = ResultModel(
        worksheet=worksheet, results_json='{"data": "test2"}', query_stats_json='{"stats": "test2"}'
    )
    session.add(worksheet)
    session.commit()

    # Verify results were created
    assert session.query(ResultModel).count() == 2

    # Delete worksheet
    session.delete(worksheet)
    session.commit()

    # Verify cascade delete
    assert session.query(ResultModel).count() == 0


def test_multiple_results_ordering(session):
    """Test that results are ordered by created_at."""
    worksheet = WorksheetModel(id="test-id", name="Test Worksheet")
    result1 = ResultModel(
        worksheet=worksheet, results_json='{"data": "test1"}', query_stats_json='{"stats": "test1"}'
    )
    result2 = ResultModel(
        worksheet=worksheet, results_json='{"data": "test2"}', query_stats_json='{"stats": "test2"}'
    )
    session.add(worksheet)
    session.commit()

    # Query results ordered by created_at
    results = session.query(ResultModel).order_by(ResultModel.created_at).all()
    assert len(results) == 2
    assert results[0].results_json == '{"data": "test1"}'
    assert results[1].results_json == '{"data": "test2"}'
