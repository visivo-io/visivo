import os
from visivo.commands.compile import compile
from visivo.parsers.file_names import PROJECT_FILE_NAME
from tests.support.utils import temp_yml_file
from click.testing import CliRunner

runner = CliRunner()


def test_compile():
    tmp = temp_yml_file(dict={"name": "project"}, name=PROJECT_FILE_NAME)
    dir = os.path.dirname(tmp)

    response = runner.invoke(compile, ["-w", dir])

    assert "Compiling" in response.output
    assert response.exit_code == 0


# ---------------------------------------------------------------------------
# VIS-1463: `visivo compile` rejects bad table configs with the model's message
# (the viewer used to be the first place these failed).
# ---------------------------------------------------------------------------


def _compile_project_with_table(table):
    project = {
        "name": "project",
        "sources": [{"name": "s", "type": "duckdb", "database": "s.duckdb"}],
        "models": [{"name": "i", "source": "ref(s)", "sql": "select 1 as region, 2 as revenue"}],
        "tables": [table],
    }
    tmp = temp_yml_file(dict=project, name=PROJECT_FILE_NAME)
    response = runner.invoke(compile, ["-w", os.path.dirname(tmp)])
    # A failed parse surfaces as a LineValidationError on the CliRunner result;
    # its str() is the message the CLI prints to the user.
    return response, str(response.exception or "")


def test_compile_rejects_pivot_value_that_is_not_an_aggregate():
    response, message = _compile_project_with_table(
        {
            "name": "bad-pivot",
            "columns": ["${ref(i).region}"],
            "rows": ["${ref(i).region}"],
            "values": ["${ref(i).revenue}"],
        }
    )
    assert response.exit_code != 0
    assert "Pivot value '${ref(i).revenue}' is not an aggregate" in message


def test_compile_rejects_pivot_value_with_arithmetic_around_aggregate():
    response, message = _compile_project_with_table(
        {
            "name": "bad-pivot",
            "columns": ["${ref(i).region}"],
            "rows": ["${ref(i).region}"],
            "values": ["sum(${ref(i).revenue}) + 1"],
        }
    )
    assert response.exit_code != 0
    assert "sum(${ref(i).revenue}) + 1' is not an aggregate" in message


def test_compile_rejects_pivot_value_window_function():
    response, message = _compile_project_with_table(
        {
            "name": "bad-pivot",
            "columns": ["${ref(i).region}"],
            "rows": ["${ref(i).region}"],
            "values": ["sum(${ref(i).revenue}) over (partition by ${ref(i).region})"],
        }
    )
    assert response.exit_code != 0
    assert "is not an aggregate" in message


def test_compile_rejects_named_format_cells_color():
    response, message = _compile_project_with_table(
        {
            "name": "bad-colour",
            "data": "ref(i)",
            "format_cells": {"scope": "table", "min_color": "red", "max_color": "#00ff00"},
        }
    )
    assert response.exit_code != 0
    assert "min_color" in message


def test_compile_accepts_aggregate_pivot_hex_colours_and_ten_rows_per_page():
    response, message = _compile_project_with_table(
        {
            "name": "good-pivot",
            "columns": ["${ref(i).region}"],
            "rows": ["${ref(i).region}"],
            "values": ["sum(${ref(i).revenue})", "count(*)"],
            "format_cells": {"scope": "table", "min_color": "#fee0d2", "max_color": "#de2d26"},
            "rows_per_page": 10,
        }
    )
    assert response.exit_code == 0, message
