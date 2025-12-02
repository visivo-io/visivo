"""
Input Job System Core - Process input options and store as parquet files.

This module handles both static and query-based input options:
- Static inputs: Validate not empty, store as parquet
- Query inputs: Execute query on source backend, validate not empty, store as parquet
"""

import os
from time import time
from typing import Optional

import polars as pl

from visivo.jobs.job import Job, JobResult, format_message_failure, format_message_success
from visivo.jobs.utils import get_source_for_model
from visivo.models.base.query_string import QueryString
from visivo.models.inputs.types.dropdown import DropdownInput
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.source import Source
from visivo.query.patterns import extract_ref_names, replace_refs


def action(input_obj: DropdownInput, dag, output_dir: str) -> JobResult:
    """
    Execute input job - compute options and store results.

    For query-based inputs: Execute query on source backend and store as parquet
    For static inputs: Store options as parquet

    Args:
        input_obj: The input object to process
        dag: The project DAG for reference resolution
        output_dir: Directory to save output files

    Returns:
        JobResult indicating success or failure
    """
    try:
        start_time = time()
        input_name = input_obj.name
        input_hash = input_obj.name_hash()
        inputs_directory = f"{output_dir}/inputs"
        os.makedirs(inputs_directory, exist_ok=True)
        parquet_path = f"{inputs_directory}/{input_hash}.parquet"

        if isinstance(input_obj.options, QueryString):
            # Query-based input - execute on source backend
            query_value = input_obj.options.get_value()

            # Extract referenced model name
            ref_names = extract_ref_names(query_value)
            # TODO: We should push this validation into pydantic and not check it in the runner. 
            if len(ref_names) == 0:
                raise ValueError(
                    f"Input '{input_name}' query must reference exactly one model using ${{ref(name)}}."
                )
            if len(ref_names) > 1:
                raise ValueError(
                    f"Input '{input_name}' query references {len(ref_names)} items but must reference exactly one model."
                )

            model_name = list(ref_names)[0]

            # Get the referenced model from DAG
            
            #TODO: validation here should also just happen in pydantic with the parent child relationship. 
            try:
                model = dag.get_descendant_by_name(model_name)
            except (ValueError, AttributeError) as e:
                raise ValueError(
                    f"Input '{input_name}' references '{model_name}' which was not found in the project."
                )

            if not isinstance(model, SqlModel):
                raise ValueError(
                    f"Input '{input_name}' query can only reference SqlModel, "
                    f"not {type(model).__name__}."
                )

            # Get source for the model
            source = get_source_for_model(model, dag, output_dir)
            if not source:
                raise ValueError(
                    f"Could not find source for model '{model_name}' referenced by input '{input_name}'"
                )

            # Replace ${ref(model)} with (model.sql) as subquery
            def replace_with_subquery(model_ref_name, field):
                if model_ref_name == model_name:
                    # Wrap model SQL in parentheses to make it a subquery
                    return f"({model.sql})"
                return f"${{ref({model_ref_name})}}"

            resolved_query = replace_refs(query_value, replace_with_subquery)

            # Execute query on source
            data = source.read_sql(resolved_query)

            # Convert to DataFrame
            df = pl.DataFrame(data)

            # Validate not empty
            if df.shape[0] == 0:
                raise ValueError(
                    f"Input '{input_name}' query returned 0 rows. "
                    f"Inputs must have at least one option."
                )

            # Ensure single column and rename to 'option'
            if df.shape[1] != 1:
                raise ValueError(
                    f"Input '{input_name}' query must return exactly one column, "
                    f"found {df.shape[1]} columns."
                )

            # Get the first column name and rename to 'option'
            first_col = df.columns[0]
            df = df.rename({first_col: "option"})

            # Convert to string type
            df = df.with_columns(pl.col("option").cast(pl.Utf8))

            # Write to parquet
            df.write_parquet(parquet_path)

            success_message = format_message_success(
                details=f"Computed query-based options for input \033[4m{input_name}\033[0m",
                start_time=start_time,
                full_path=parquet_path,
            )
            return JobResult(item=input_obj, success=True, message=success_message)

        else:
            # Static options - store as parquet
            if not input_obj.options or len(input_obj.options) == 0:
                raise ValueError(
                    f"Input '{input_name}' has empty options list. Must have at least one option."
                )

            # Convert to DataFrame with 'option' column
            df = pl.DataFrame({"option": [str(opt) for opt in input_obj.options]})

            # Write to parquet
            df.write_parquet(parquet_path)

            success_message = format_message_success(
                details=f"Stored static options for input \033[4m{input_name}\033[0m",
                start_time=start_time,
                full_path=parquet_path,
            )
            return JobResult(item=input_obj, success=True, message=success_message)

    except Exception as e:
        message = e.message if hasattr(e, "message") else str(e)
        failure_msg = format_message_failure(
            details=f"Failed to process input \033[4m{input_obj.name}\033[0m",
            start_time=start_time,
            full_path=None,
            error_msg=message,
        )
        return JobResult(item=input_obj, success=False, message=failure_msg)


def job(dag, output_dir: str, input_obj: DropdownInput) -> Job:
    """
    Create input job for execution in DAG runner.

    For query-based inputs, assigns the source from the referenced model.
    For static inputs, no source is needed (source=None).

    Args:
        dag: The project DAG
        output_dir: Directory to save output files
        input_obj: The input object to create a job for

    Returns:
        Job object with appropriate source (or None for static inputs)
    """
    source: Optional[Source] = None

    # Only query-based inputs need a source
    if isinstance(input_obj.options, QueryString):
        query_value = input_obj.options.get_value()
        ref_names = extract_ref_names(query_value)

        if len(ref_names) > 0:
            model_name = list(ref_names)[0]
            try:
                model = dag.get_descendant_by_name(model_name)
                if isinstance(model, SqlModel):
                    source = get_source_for_model(model, dag, output_dir)
            except (ValueError, AttributeError):
                # If we can't find the model or source here, it will fail in action()
                # which provides better error messages
                pass

    return Job(
        item=input_obj,
        source=source,
        action=action,
        input_obj=input_obj,
        dag=dag,
        output_dir=output_dir,
    )
