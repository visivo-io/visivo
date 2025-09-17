from typing import Literal, Optional, Dict, List, Any
from visivo.models.sources.base_duckdb_source import BaseDuckdbSource
from pydantic import Field
import duckdb
import click
import os
from visivo.logger.logger import Logger


class ExcelFileSource(BaseDuckdbSource):
    type: Literal["xls"]
    file: str = Field(..., description="Path to the Excel file.")
    delimiter: Optional[str] = Field(",", description="Excel delimiter.")
    encoding: Optional[str] = Field("utf-8", description="Excel file encoding.")
    has_header: Optional[bool] = Field(True, description="Whether Excel has a header row.")

    def get_connection(self, read_only: bool = False):
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
        """Setup the DuckDB connection by creating a view from the Excel file."""
        try:
            # For Excel files, we'll need to use the spatial extension or convert to CSV first
            # For now, let's try to use read_csv_auto assuming it's been converted
            # TODO: In the future, we could add Excel-specific handling here
            connection.execute(
                f"""
                CREATE VIEW "{self.name}" AS
                SELECT * FROM read_csv_auto('{self.file}', delim='{self.delimiter}', header={str(self.has_header).upper()})
                """
            )
        except Exception as e:
            raise click.ClickException(f"Error setting up Excel view: {e}")

    def description(self):
        """Return a description of this source for logging and error messages."""
        return f"{self.type} source '{self.name}' (file: {self.file})"
