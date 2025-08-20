from typing import Literal, Optional, Dict
from visivo.models.sources.source import BaseSource
from pydantic import Field
import duckdb
import click
from datetime import datetime, date, time
from decimal import Decimal
from visivo.logger.logger import Logger


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

    def get_model_schema(self, model_sql: str = None, table_name: str = None) -> Dict[str, str]:
        """Extract column metadata from CSV source using DuckDB in-memory connection.

        CSV sources create a view with the source name, so we query that directly.
        """
        # For CSV sources, we typically query the view created with the source name
        # or use the provided table_name/model_sql
        if model_sql:
            schema_query = f"SELECT * FROM ({model_sql}) AS subquery LIMIT 0"
        elif table_name:
            schema_query = f"SELECT * FROM {table_name} LIMIT 0"
        else:
            # Default to querying the view with the source name
            schema_query = f'SELECT * FROM "{self.name}" LIMIT 0'

        column_info = {}

        try:
            # First try with LIMIT 0 to get schema without data
            with self.connect(read_only=True) as connection:
                # DuckDB native connections don't use text() wrapper
                result = connection.execute(schema_query)

                # Get column names and types from result metadata
                if result.description:
                    for column in result.description:
                        column_name = column[0]
                        # DuckDB provides type information in description
                        if len(column) > 1 and column[1] is not None:
                            column_info[column_name] = str(column[1])
                        else:
                            column_info[column_name] = None  # Will need type inference

            # Check if we need to infer types (if any are None)
            if any(t is None for t in column_info.values()):
                raise Exception("Need type inference")

        except Exception:
            # If LIMIT 0 doesn't work or types are None, try with LIMIT 10 to infer types
            try:
                if model_sql:
                    schema_query_with_data = f"SELECT * FROM ({model_sql}) AS subquery LIMIT 10"
                elif table_name:
                    schema_query_with_data = f"SELECT * FROM {table_name} LIMIT 10"
                else:
                    schema_query_with_data = f'SELECT * FROM "{self.name}" LIMIT 10'

                with self.connect(read_only=True) as connection:
                    # DuckDB native connections don't use text() wrapper
                    result = connection.execute(schema_query_with_data)

                    # Get column names from result
                    columns = [desc[0] for desc in result.description] if result.description else []
                    rows = result.fetchall()

                # Infer types from the data
                for col_idx, col_name in enumerate(columns):
                    # Sample values from the column
                    values = [row[col_idx] for row in rows if row[col_idx] is not None]

                    if not values:
                        column_info[col_name] = "UNKNOWN"
                        continue

                    # Infer type from non-null values using Python types
                    sample_value = values[0]

                    # Check Python types in order of specificity
                    # Note: bool must be checked before int since bool is a subclass of int
                    if isinstance(sample_value, bool):
                        column_info[col_name] = "BOOLEAN"
                    elif isinstance(sample_value, datetime):
                        column_info[col_name] = "TIMESTAMP"
                    elif isinstance(sample_value, date):
                        column_info[col_name] = "DATE"
                    elif isinstance(sample_value, time):
                        column_info[col_name] = "TIME"
                    elif isinstance(sample_value, Decimal):
                        column_info[col_name] = "DECIMAL"
                    elif isinstance(sample_value, int):
                        column_info[col_name] = "INTEGER"
                    elif isinstance(sample_value, float):
                        column_info[col_name] = "NUMERIC"
                    elif isinstance(sample_value, str):
                        column_info[col_name] = "VARCHAR"
                    elif isinstance(sample_value, bytes):
                        column_info[col_name] = "BINARY"
                    else:
                        # Fallback for unknown types
                        column_info[col_name] = str(type(sample_value).__name__).upper()

            except Exception as e:
                Logger.instance().debug(f"Could not extract schema: {str(e)}")
                column_info = {}

        return column_info


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
