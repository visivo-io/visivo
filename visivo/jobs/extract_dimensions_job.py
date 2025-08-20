"""Job for extracting column dimensions from model schemas."""

from typing import Optional, Any
from visivo.jobs.job import Job, JobResult
from visivo.models.models.sql_model import SqlModel
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.dimension import Dimension
from visivo.logger.logger import Logger
from visivo.jobs.utils import get_source_for_model


def extract_dimensions_for_model(model: Any, source: Any) -> None:
    """
    Extract dimensions for a model directly (called from within other jobs).

    This function modifies the model in-place by adding _implicit_dimensions.
    """
    try:
        # Skip if not a SQL-based model
        if not isinstance(model, (SqlModel, CsvScriptModel, LocalMergeModel)):
            return

        # Get column metadata from the source
        if isinstance(model, SqlModel) or isinstance(model, LocalMergeModel):
            # For SQL and LocalMerge models, pass the SQL
            column_info = source.get_model_schema(model_sql=model.sql)
        else:  # CsvScriptModel
            # For CSV models, pass the table name
            table_name = getattr(model, "table_name", model.name)
            column_info = source.get_model_schema(table_name=table_name)

        if not column_info:
            # If we can't extract columns, just skip dimension extraction
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

    This job uses the source's get_model_schema method to get column metadata,
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
                Logger.instance().debug(
                    f"No source found for model {model.name}, skipping dimension extraction"
                )
                return JobResult(
                    item=model,
                    success=True,  # Don't fail the job, just skip dimension extraction
                    message=f"Skipped dimension extraction for {model.name} (no source found)",
                )

            # Get column metadata from the source
            if isinstance(model, SqlModel) or isinstance(model, LocalMergeModel):
                # For SQL and LocalMerge models, pass the SQL
                column_info = source.get_model_schema(model_sql=model.sql)
            else:  # CsvScriptModel
                # For CSV models, pass the table name
                table_name = getattr(model, "table_name", model.name)
                column_info = source.get_model_schema(table_name=table_name)

            if not column_info:
                # If we can't extract columns, just skip dimension extraction
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
