"""Job for extracting column dimensions from model schemas."""

from typing import Optional, Any
from visivo.jobs.job import Job, JobResult
from visivo.models.models.sql_model import SqlModel
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.dimension import Dimension
from visivo.logger.logger import Logger
from visivo.jobs.utils import get_source_for_model
from sqlalchemy import text
from datetime import datetime, date, time
from decimal import Decimal


def extract_dimensions_for_model(model: Any, source: Any) -> None:
    """
    Extract dimensions for a model directly (called from within other jobs).

    This function modifies the model in-place by adding _implicit_dimensions.
    """
    try:
        # Build the query to get schema
        if isinstance(model, SqlModel) or isinstance(model, LocalMergeModel):
            # For SQL and LocalMerge models, wrap the SQL in a subquery with LIMIT 0
            schema_query = f"SELECT * FROM ({model.sql}) AS subquery LIMIT 0"
        else:  # CsvScriptModel
            # For CSV models, query the table directly
            # The table name is the model's table_name or name
            table_name = getattr(model, "table_name", model.name)
            schema_query = f"SELECT * FROM {table_name} LIMIT 0"

        # Execute the query to get column metadata
        column_info = {}
        try:
            with source.connect() as connection:
                result = connection.execute(text(schema_query))

                # Get column names and types from result metadata
                for column in result.cursor.description:
                    column_name = column[0]
                    # Try to get the type information
                    # The exact format depends on the database driver
                    # We'll store the type as a string representation
                    # SQLite cursor.description often has None for type
                    if len(column) > 1 and column[1] is not None:
                        column_type = str(column[1])
                    else:
                        column_type = None  # Will trigger type inference
                    column_info[column_name] = column_type

                result.close()

                # Check if we need to infer types (if any are None)
                if any(t is None for t in column_info.values()):
                    raise Exception("Need type inference")
        except Exception as e:
            # If LIMIT 0 doesn't work or types are None, try with LIMIT 10 to infer types from data
            try:
                if isinstance(model, SqlModel) or isinstance(model, LocalMergeModel):
                    schema_query_with_data = f"SELECT * FROM ({model.sql}) AS subquery LIMIT 10"
                else:  # CsvScriptModel
                    table_name = getattr(model, "table_name", model.name)
                    schema_query_with_data = f"SELECT * FROM {table_name} LIMIT 10"

                with source.connect() as connection:
                    result = connection.execute(text(schema_query_with_data))

                    # Get column names from result
                    columns = list(result.keys())
                    rows = result.fetchall()
                    result.close()

                    # Infer types from the data
                    for col_idx, col_name in enumerate(columns):
                        # Sample values from the column
                        values = [row[col_idx] for row in rows if row[col_idx] is not None]

                        if not values:
                            column_info[col_name] = "UNKNOWN"
                            continue

                        # Infer type from non-null values using Python types
                        # SQLAlchemy converts SQL types to appropriate Python types
                        sample_value = values[0]

                        # Check Python types in order of specificity
                        # Note: bool must be checked before int since bool is a subclass of int in Python
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

            except Exception as e2:
                Logger.instance().debug(
                    f"Could not extract schema for model {model.name}: {str(e2)}"
                )
                # Can't extract schema at all
                column_info = {}

        if not column_info:
            # If we can't extract columns, just skip dimension extraction
            # This can happen with test fixtures or when the source is unavailable
            Logger.instance().debug(
                f"Could not extract columns from model {model.name}, skipping dimension extraction"
            )
            return

        # Get explicitly defined dimension names
        explicit_dimension_names = {dim.name for dim in model.dimensions}

        # Create implicit dimensions for columns not already defined
        implicit_dimensions = []
        for column_name, column_type in column_info.items():
            if column_name not in explicit_dimension_names:
                # Create an implicit dimension that references the column
                implicit_dimension = Dimension(
                    name=column_name,
                    expression=column_name,  # Simple column reference
                    data_type=column_type,
                    description=f"Auto-generated dimension for column '{column_name}' ({column_type})",
                )
                implicit_dimensions.append(implicit_dimension)

        # Store the implicit dimensions on the model (in memory only)
        if not hasattr(model, "_implicit_dimensions"):
            model._implicit_dimensions = []
        model._implicit_dimensions = implicit_dimensions

        Logger.instance().debug(
            f"Extracted {len(implicit_dimensions)} implicit dimensions from {model.name}"
        )

    except Exception as e:
        Logger.instance().debug(f"Failed to extract dimensions from {model.name}: {str(e)}")


def job(model: Any, dag: Any, output_dir: str = None) -> Optional[Job]:
    """
    Create a job that extracts column dimensions from a model's schema.

    This job queries the model with LIMIT 0 to get column metadata without fetching data,
    then creates implicit dimensions for each column that doesn't already have an explicit dimension.
    """

    def extract_dimensions(output_dir=output_dir):
        try:
            # Skip if not a SQL-based model
            if not isinstance(model, (SqlModel, CsvScriptModel, LocalMergeModel)):
                return JobResult(
                    item=model,
                    success=True,
                    message=f"Skipping dimension extraction for non-SQL model {model.name}",
                )

            # Get the source for the model using common utility
            if not output_dir:
                import tempfile

                output_dir = tempfile.gettempdir()
            source = get_source_for_model(model=model, dag=dag, output_dir=output_dir)

            if not source:
                # Skip dimension extraction if source is not available
                # This can happen when model.source is None and no default source is found
                Logger.instance().debug(
                    f"No source found for model {model.name}, skipping dimension extraction"
                )
                return JobResult(
                    item=model,
                    success=True,  # Don't fail the job, just skip dimension extraction
                    message=f"Skipped dimension extraction for {model.name} (no source found)",
                )

            # Build the query to get schema
            if isinstance(model, SqlModel) or isinstance(model, LocalMergeModel):
                # For SQL and LocalMerge models, wrap the SQL in a subquery with LIMIT 0
                schema_query = f"SELECT * FROM ({model.sql}) AS subquery LIMIT 0"
            else:  # CsvScriptModel
                # For CSV models, query the table directly
                # The table name is the model's table_name or name
                table_name = getattr(model, "table_name", model.name)
                schema_query = f"SELECT * FROM {table_name} LIMIT 0"

            # Execute the query to get column metadata
            column_info = {}
            try:
                with source.connect() as connection:
                    result = connection.execute(text(schema_query))

                    # Get column names and types from result metadata
                    for column in result.cursor.description:
                        column_name = column[0]
                        # Try to get the type information
                        # The exact format depends on the database driver
                        # We'll store the type as a string representation
                        # SQLite cursor.description often has None for type
                        if len(column) > 1 and column[1] is not None:
                            column_type = str(column[1])
                        else:
                            column_type = None  # Will trigger type inference
                        column_info[column_name] = column_type

                    result.close()

                    # Check if we need to infer types (if any are None)
                    if any(t is None for t in column_info.values()):
                        raise Exception("Need type inference")
            except Exception as e:
                # If LIMIT 0 doesn't work or types are None, try with LIMIT 10 to infer types from data
                try:
                    if isinstance(model, SqlModel) or isinstance(model, LocalMergeModel):
                        schema_query_with_data = f"SELECT * FROM ({model.sql}) AS subquery LIMIT 10"
                    else:  # CsvScriptModel
                        table_name = getattr(model, "table_name", model.name)
                        schema_query_with_data = f"SELECT * FROM {table_name} LIMIT 10"

                    with source.connect() as connection:
                        result = connection.execute(text(schema_query_with_data))

                        # Get column names from result
                        columns = list(result.keys())
                        rows = result.fetchall()
                        result.close()

                        # Infer types from the data
                        for col_idx, col_name in enumerate(columns):
                            # Sample values from the column
                            values = [row[col_idx] for row in rows if row[col_idx] is not None]

                            if not values:
                                column_info[col_name] = "UNKNOWN"
                                continue

                            # Infer type from non-null values using Python types
                            # SQLAlchemy converts SQL types to appropriate Python types
                            sample_value = values[0]

                            # Check Python types in order of specificity
                            # Note: bool must be checked before int since bool is a subclass of int in Python
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

                except Exception as e2:
                    Logger.instance().debug(
                        f"Could not extract schema for model {model.name}: {str(e2)}"
                    )
                    # Can't extract schema at all
                    column_info = {}

            if not column_info:
                # If we can't extract columns, just skip dimension extraction
                # This can happen with test fixtures or when the source is unavailable
                Logger.instance().debug(
                    f"Could not extract columns from model {model.name}, skipping dimension extraction"
                )
                return JobResult(
                    item=model,
                    success=True,  # Don't fail the job, just skip dimension extraction
                    message=f"Skipped dimension extraction for {model.name} (no columns found)",
                )

            # Get explicitly defined dimension names
            explicit_dimension_names = {dim.name for dim in model.dimensions}

            # Create implicit dimensions for columns not already defined
            implicit_dimensions = []
            for column_name, column_type in column_info.items():
                if column_name not in explicit_dimension_names:
                    # Create an implicit dimension that references the column
                    implicit_dimension = Dimension(
                        name=column_name,
                        expression=column_name,  # Simple column reference
                        data_type=column_type,
                        description=f"Auto-generated dimension for column '{column_name}' ({column_type})",
                    )
                    implicit_dimensions.append(implicit_dimension)

            # Store the implicit dimensions on the model (in memory only)
            if not hasattr(model, "_implicit_dimensions"):
                model._implicit_dimensions = []
            model._implicit_dimensions = implicit_dimensions

            Logger.instance().debug(
                f"Extracted {len(implicit_dimensions)} implicit dimensions from {model.name}"
            )

            return JobResult(
                item=model,
                success=True,
                message=f"Extracted {len(implicit_dimensions)} dimensions from {model.name}",
            )

        except Exception as e:
            return JobResult(
                item=model,
                success=False,
                message=f"Failed to extract dimensions from {model.name}: {str(e)}",
            )

    return Job(
        item=model,
        source=getattr(model, "source", None),
        action=extract_dimensions,
    )
