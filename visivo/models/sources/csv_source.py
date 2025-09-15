from typing import Literal, Optional, Dict, List, Any
from visivo.models.sources.base_duckdb_source import BaseDuckdbSource
from pydantic import Field
import duckdb
import click
import os
from visivo.logger.logger import Logger


class CSVFileSource(BaseDuckdbSource):
    type: Literal["csv"]
    file: str = Field(..., description="Path to the CSV file.")
    delimiter: Optional[str] = Field(",", description="CSV delimiter.")
    encoding: Optional[str] = Field("utf-8", description="CSV file encoding.")
    has_header: Optional[bool] = Field(True, description="Whether CSV has a header row.")

    def get_connection(self, read_only: bool = False):
        """Create an in-memory DuckDB connection with the CSV loaded as a view."""
        try:
            # Check if file exists
            if not os.path.exists(self.file):
                raise click.ClickException(f"CSV file not found: {self.file}")

            connection = duckdb.connect(":memory:")
            return connection
        except Exception as err:
            raise click.ClickException(
                f"Error connecting to CSV source '{self.name}'. Full Error: {str(err)}"
            )

    def _setup_connection(self, connection, **kwargs):
        """Setup the DuckDB connection by creating a view from the CSV file."""
        try:
            connection.execute(
                f"""
                CREATE VIEW "{self.name}" AS
                SELECT * FROM read_csv_auto('{self.file}', delim='{self.delimiter}', header={str(self.has_header).upper()})
                """
            )
        except Exception as e:
            raise click.ClickException(f"Error setting up CSV view: {e}")

    def description(self):
        """Return a description of this source for logging and error messages."""
        return f"{self.type} source '{self.name}' (file: {self.file})"
