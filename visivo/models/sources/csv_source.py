from typing import Literal, Optional, Dict, List, Any
from visivo.models.sources.source import BaseSource
from pydantic import Field
import duckdb
import click
from datetime import datetime, date, time
from decimal import Decimal
from visivo.logger.logger import Logger
from sqlglot.schema import MappingSchema
from visivo.query.sqlglot_type_mapper import SqlglotTypeMapper
import os
import pandas as pd


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

    def read_sql(self, query: str, **kwargs):
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

    def get_schema(self, table_names: List[str] = None) -> Dict[str, Any]:
        """
        Build SQLGlot schema for this CSV source.

        Args:
            table_names: Optional list of table names to include. For CSV sources,
                        this would typically be just the source name itself.

        Returns:
            Dictionary containing:
            - tables: Dict mapping table names to column info
            - sqlglot_schema: SQLGlot MappingSchema for query optimization
            - metadata: Additional metadata about the schema
        """
        try:
            # Check if file exists
            if not os.path.exists(self.file):
                return {
                    "tables": {},
                    "sqlglot_schema": MappingSchema(),
                    "metadata": {
                        "error": f"File not found: {self.file}",
                        "total_tables": 0,
                        "total_columns": 0,
                    },
                }

            # If table_names is specified and doesn't include this source, return empty
            if table_names and self.name not in table_names:
                return {
                    "tables": {},
                    "sqlglot_schema": MappingSchema(),
                    "metadata": {"total_tables": 0, "total_columns": 0},
                }

            # Read sample of CSV to infer schema
            try:
                # Read first few rows to infer column types
                df_sample = pd.read_csv(
                    self.file,
                    delimiter=self.delimiter,
                    encoding=self.encoding,
                    header=0 if self.has_header else None,
                    nrows=100,  # Sample first 100 rows for type inference
                )

                if not self.has_header:
                    # Generate column names if no header
                    df_sample.columns = [f"column_{i}" for i in range(len(df_sample.columns))]

            except Exception as e:
                return {
                    "tables": {},
                    "sqlglot_schema": MappingSchema(),
                    "metadata": {
                        "error": f"Error reading CSV file: {str(e)}",
                        "total_tables": 0,
                        "total_columns": 0,
                    },
                }

            # Build schema for the CSV "table"
            table_schema = {
                "columns": {},
                "metadata": {
                    "table_name": self.name,
                    "file_path": self.file,
                    "column_count": len(df_sample.columns),
                    "sample_rows": len(df_sample),
                },
            }

            # Create SQLGlot schema
            sqlglot_schema = MappingSchema()
            columns_dict = {}

            for col_name in df_sample.columns:
                # Get sample values for type inference
                sample_values = df_sample[col_name].dropna().head(10).tolist()

                # Infer SQLGlot DataType
                sqlglot_datatype = SqlglotTypeMapper.infer_file_column_type(sample_values, col_name)

                table_schema["columns"][col_name] = {
                    "type": sqlglot_datatype.sql(),
                    "nullable": True,  # CSV columns are generally nullable
                    "inferred_from_samples": len(sample_values),
                    "sqlglot_datatype": sqlglot_datatype,
                    "sqlglot_type_info": SqlglotTypeMapper.serialize_datatype(sqlglot_datatype),
                }

                columns_dict[col_name] = sqlglot_datatype

            # Add table to SQLGlot schema
            sqlglot_schema.add_table(self.name, columns_dict)

            result = {
                "tables": {self.name: table_schema},
                "sqlglot_schema": sqlglot_schema,
                "metadata": {
                    "source_type": "csv",
                    "file_path": self.file,
                    "total_tables": 1,
                    "total_columns": len(df_sample.columns),
                },
            }

            Logger.instance().debug(
                f"Built CSV schema for '{self.name}' with {len(df_sample.columns)} columns"
            )

            return result

        except Exception as e:
            Logger.instance().error(f"Error building schema for CSV source {self.name}: {e}")
            return {
                "tables": {},
                "sqlglot_schema": MappingSchema(),
                "metadata": {"error": str(e), "total_tables": 0, "total_columns": 0},
            }


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
