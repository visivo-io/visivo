from typing import Literal, Optional
from visivo.models.sources.source import BaseSource
from pydantic import Field
import duckdb
import click


class CSVFileSource(BaseSource):
    type: Literal["csv"]
    file: str = Field(..., description="Path to the CSV file.")
    delimiter: Optional[str] = Field(",", description="CSV delimiter.")
    encoding: Optional[str] = Field("utf-8", description="CSV file encoding.")
    has_header: Optional[bool] = Field(True, description="Whether CSV has a header row.")

    def get_connection(self, read_only: bool = False):
        try:
            connection = duckdb.connect(":memory:")
            connection.execute(
                f"""
                CREATE VIEW "{self.name}" AS
                SELECT * FROM read_csv_auto('{self.file}', delim='{self.delimiter}', header={str(self.has_header).upper()})
                """
            )
            return connection
        except Exception as err:
            raise click.ClickException(
                f"Error connecting to CSV source '{self.name}'. Full Error: {str(err)}"
            )

    def read_sql(self, query: str):
        try:
            with self.connect(read_only=True) as connection:
                result = connection.execute(query)
                columns = [desc[0] for desc in result.description] if result.description else []
                rows = result.fetchall()
                return [dict(zip(columns, row)) for row in rows]
        except Exception as err:
            raise click.ClickException(
                f"Error executing query on CSV source '{self.name}': {str(err)}"
            )

    def connect(self, read_only: bool = False):
        return CSVConnection(source=self, read_only=read_only)

    def get_dialect(self):
        return "duckdb"


class CSVConnection:
    def __init__(self, source: CSVFileSource, read_only: bool = False):
        self.source = source
        self.conn = None
        self.read_only = read_only

    def __enter__(self):
        self.conn = self.source.get_connection(read_only=self.read_only)
        return self.conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.conn:
            self.conn.close()
            self.conn = None
