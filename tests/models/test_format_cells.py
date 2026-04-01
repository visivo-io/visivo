from visivo.models.format_cells import FormatCells, FormatCellsScope
from pydantic import ValidationError
import pytest


def test_format_cells_valid():
    fc = FormatCells(scope="column", min_color="#ff0000", max_color="#00ff00")
    assert fc.scope == FormatCellsScope.column
    assert fc.min_color == "#ff0000"
    assert fc.max_color == "#00ff00"


def test_format_cells_all_scopes():
    for scope_val in ["row", "column", "table"]:
        fc = FormatCells(scope=scope_val, min_color="#000000", max_color="#ffffff")
        assert fc.scope.value == scope_val


def test_format_cells_invalid_scope():
    with pytest.raises(ValidationError):
        FormatCells(scope="invalid", min_color="#000000", max_color="#ffffff")


def test_format_cells_missing_fields():
    with pytest.raises(ValidationError):
        FormatCells(scope="column")

    with pytest.raises(ValidationError):
        FormatCells(scope="column", min_color="#000000")


def test_format_cells_serialization():
    fc = FormatCells(scope="column", min_color="#ff0000", max_color="#00ff00")
    data = fc.model_dump(exclude_none=True, mode="json")
    assert data == {
        "scope": "column",
        "min_color": "#ff0000",
        "max_color": "#00ff00",
    }
