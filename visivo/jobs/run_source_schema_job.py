"""
Job for building and storing SQLGlot schemas from data sources.
"""

from visivo.constants import DEFAULT_RUN_ID
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


def run_seeds(source: Source, working_dir: str = None) -> int:
    """Load each of the source's seeds into a table on that source.

    Runs before schema introspection so the seeded tables are discoverable, and before
    any model job, which the Model->Source DAG edge already guarantees.

    Each seed's command is run to completion and its stdout is validated as CSV *before*
    the database connection is opened — a subprocess holding a connection open while the
    writer waits on it has deadlocked here before.

    Returns:
        The number of seeds loaded
    """
    import io
    import subprocess

    import click
    import polars as pl

    seeds = getattr(source, "seeds", None) or []
    for seed in seeds:
        Logger.instance().debug(f"Source {source.name}: running seed {seed.table_name}")
        process = subprocess.Popen(
            seed.args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=working_dir
        )
        stdout, stderr = process.communicate()

        if process.returncode != 0:
            raise click.ClickException(
                f"Command for seed {seed.table_name} on source {source.name} failed with "
                f"return code {process.returncode}. stderr: {stderr.decode()}"
            )

        csv_stream = io.StringIO(stdout.decode())
        seed.validate_stream_is_csv(csv_stream)

        if not csv_stream.read().strip():
            csv_stream.seek(0)
            Logger.instance().debug(
                f"Source {source.name}: seed {seed.table_name} returned no data, skipping write"
            )
            continue
        csv_stream.seek(0)

        source.write_dataframe(seed.table_name, pl.read_csv(csv_stream))
        Logger.instance().debug(f"Source {source.name}: seed {seed.table_name} loaded")

    return len(seeds)


def action(
    source_to_build: Source,
    table_names: Optional[List[str]] = None,
    output_dir: str = None,
    run_id: str = DEFAULT_RUN_ID,
    working_dir: str = None,
):
    """
    Load the source's seeds, then build its schema and store it using SchemaAggregator.

    Args:
        source_to_build: The source to seed and build schema for
        table_names: Optional list of table names to include
        output_dir: Directory to store schema data
        run_id: Run identifier for schema storage location
        working_dir: Directory seed commands are run from

    Returns:
        JobResult indicating success or failure
    """
    Logger.instance().info(start_message("Source Schema", source_to_build))

    try:
        start_time = time()

        # Seeds must land before introspection so their tables appear in the schema
        seed_count = run_seeds(source_to_build, working_dir=working_dir)

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

        SchemaAggregator.aggregate_source_schema(
            source_name=source_to_build.name,
            source_type=source_to_build.type,
            schema_data=schema_data,
            output_dir=output_dir,
            run_id=run_id,
        )

        # Create success message with schema statistics
        metadata = schema_data.get("metadata", {})
        total_tables = metadata.get("total_tables", 0)
        total_columns = metadata.get("total_columns", 0)

        seed_details = f"{seed_count} seeds, " if seed_count else ""
        details = (
            f"Built schema for source \033[4m{source_to_build.name}\033[0m "
            f"({seed_details}{total_tables} tables, {total_columns} columns)"
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


def job(
    source: Source,
    table_names: Optional[List[str]] = None,
    output_dir: str = None,
    run_id: str = None,
    working_dir: str = None,
):
    """
    Create a Job instance for seeding a source and building its schema.

    Args:
        source: The source to seed and build schema for
        table_names: Optional list of table names to include
        output_dir: Directory to store schema data
        run_id: Run identifier for schema storage location
        working_dir: Directory seed commands are run from

    Returns:
        Job instance configured for seeding and schema building
    """
    kwargs = {
        "item": source,
        "source": source,
        "action": action,
        "source_to_build": source,
        "table_names": table_names,
        "output_dir": output_dir,
    }
    if run_id is not None:
        kwargs["run_id"] = run_id
    if working_dir is not None:
        kwargs["working_dir"] = working_dir
    return Job(**kwargs)
