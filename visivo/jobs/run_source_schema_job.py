"""
Job for building and storing SQLGlot schemas from data sources.
"""

from visivo.logger.logger import Logger
from visivo.models.sources.source import Source
from visivo.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
    start_message,
)
from visivo.query.schema_aggregator import SchemaAggregator
from time import time
from typing import List, Optional


def action(
    source_to_build: Source, table_names: Optional[List[str]] = None, output_dir: str = None
):
    """
    Build schema for a source and store it using SchemaAggregator.

    Args:
        source_to_build: The source to build schema for
        table_names: Optional list of table names to include
        output_dir: Directory to store schema data

    Returns:
        JobResult indicating success or failure
    """
    Logger.instance().info(start_message("Source Schema", source_to_build))

    try:
        start_time = time()

        # Build schema using source's get_schema method
        schema_data = source_to_build.get_schema(table_names=table_names)

        # Check if schema building was successful
        if "error" in schema_data.get("metadata", {}):
            error_msg = schema_data["metadata"]["error"]
            failure_message = format_message_failure(
                details=f"Failed to build schema for source \033[4m{source_to_build.name}\033[0m",
                start_time=start_time,
                error_msg=f"Schema building error: {error_msg}",
                full_path=None,
            )
            return JobResult(item=source_to_build, success=False, message=failure_message)

        # Store schema data using SchemaAggregator
        SchemaAggregator.aggregate_source_schema(
            source_name=source_to_build.name,
            source_type=source_to_build.type,
            schema_data=schema_data,
            output_dir=output_dir,
        )

        # Create success message with schema statistics
        metadata = schema_data.get("metadata", {})
        total_tables = metadata.get("total_tables", 0)
        total_columns = metadata.get("total_columns", 0)

        details = (
            f"Built schema for source \033[4m{source_to_build.name}\033[0m "
            f"({total_tables} tables, {total_columns} columns)"
        )

        success_message = format_message_success(
            details=details,
            start_time=start_time,
            full_path=None,
        )

        return JobResult(item=source_to_build, success=True, message=success_message)

    except Exception as e:
        failure_message = format_message_failure(
            details=f"Failed to build schema for source \033[4m{source_to_build.name}\033[0m",
            start_time=start_time,
            error_msg=f"Schema building error: {source_to_build.description()}. {str(repr(e))}",
            full_path=None,
        )
        return JobResult(item=source_to_build, success=False, message=failure_message)


def job(source: Source, table_names: Optional[List[str]] = None, output_dir: str = None):
    """
    Create a Job instance for building source schema.

    Args:
        source: The source to build schema for
        table_names: Optional list of table names to include
        output_dir: Directory to store schema data

    Returns:
        Job instance configured for schema building
    """
    return Job(
        item=source,
        source=source,
        action=action,
        source_to_build=source,
        table_names=table_names,
        output_dir=output_dir,
    )
