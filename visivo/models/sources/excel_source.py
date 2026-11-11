from typing import Literal, Optional, Dict, List, Any
from visivo.models.sources.base_duckdb_source import BaseDuckdbSource
from pydantic import Field
import click
import os
from visivo.logger.logger import Logger
from visivo.models.sources.seed import sql_string_literal


class ExcelFileSource(BaseDuckdbSource):
    """
    ExcelFileSources let you query a local Excel file with SQL — no database required.

    The file is loaded into an in-memory DuckDB connection and exposed as a view named
    after the source, so models can `SELECT` from it like any other table.

    !!! example

        ``` yaml
        sources:
          - name: budget_xls
            type: xls
            file: data/budget.xlsx

        models:
          - name: budget
            source: ${ref(budget_xls)}
            sql: SELECT * FROM budget_xls
        ```
    """

    type: Literal["xls"]
    file: str = Field(..., description="Path to the Excel file, relative to the project directory.")
    sheet: Optional[str] = Field(
        None, description="The worksheet to read. Defaults to the first sheet."
    )
    delimiter: Optional[str] = Field(
        ",", description="Not used: Excel files have no delimiter. Kept so older projects load."
    )
    encoding: Optional[str] = Field(
        "utf-8",
        description="Not used: Excel files carry their own encoding. Kept so older projects load.",
    )
    has_header: Optional[bool] = Field(
        True, description="Whether the first row of the sheet contains column names."
    )

    def get_connection(self, read_only: bool = False):
        import duckdb

        """Create an in-memory DuckDB connection with the Excel file loaded as a view."""
        try:
            # Check if file exists
            if not os.path.exists(self.file):
                raise click.ClickException(f"Excel file not found: {self.file}")

            connection = duckdb.connect(":memory:")
            return connection
        except Exception as err:
            raise click.ClickException(
                f"Error connecting to Excel source '{self.name}'. Full Error: {str(err)}"
            )

    def _setup_connection(self, connection, **kwargs):
        """Create a view named after the source over the Excel file."""
        options = [sql_string_literal(self.file), f"header = {str(bool(self.has_header)).lower()}"]
        if self.sheet:
            options.append(f"sheet = {sql_string_literal(self.sheet)}")
        try:
            connection.execute("INSTALL excel")
            connection.execute("LOAD excel")
            connection.execute(
                f"CREATE VIEW {self._quote_table(self.name)} AS "
                f"SELECT * FROM read_xlsx({', '.join(options)})"
            )
        except Exception as e:
            raise click.ClickException(f"Error setting up Excel view: {e}")

    def description(self):
        """Return a description of this source for logging and error messages."""
        return f"{self.type} source '{self.name}' (file: {self.file})"
