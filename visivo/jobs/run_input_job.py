"""
Input Job System Core - Process input options and store as JSON files.

This module handles both single-select and multi-select input types:
- SingleSelectInput: Execute options query, store as JSON
- MultiSelectInput: Execute options OR range queries, store as JSON

JSON output includes all resolved values for frontend consumption.
"""

import json
import os
from time import time
from typing import Optional, Union, List, Any

import polars as pl
from sqlglot import parse_one
from sqlglot.optimizer import qualify

from visivo.jobs.job import Job, JobResult, format_message_failure, format_message_success
from visivo.jobs.utils import get_source_for_model
from visivo.models.base.query_string import QueryString
from visivo.models.inputs.types.single_select import SingleSelectInput
from visivo.models.inputs.types.multi_select import MultiSelectInput
from visivo.models.models.sql_model import SqlModel
from visivo.models.sources.source import Source
from visivo.query.patterns import extract_ref_names, replace_refs
from visivo.query.sqlglot_utils import get_sqlglot_dialect


# Constants for option count limits
OPTION_COUNT_WARNING_THRESHOLD = 10000
OPTION_COUNT_ERROR_THRESHOLD = 100000


def _execute_query_for_options(
    query_value: str,
    dag,
    input_name: str,
    output_dir: str,
) -> List[str]:
    """
    Execute a query to get options from a data source.

    Args:
        query_value: The query string (without ?{ } wrapper)
        dag: Project DAG for model resolution
        input_name: Name of the input (for error messages)
        output_dir: Output directory

    Returns:
        List of option values as strings

    Raises:
        ValueError: If query references invalid model or returns invalid data
    """
    # Extract referenced model name
    ref_names = extract_ref_names(query_value)

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
    try:
        model = dag.get_descendant_by_name(model_name)
    except (ValueError, AttributeError):
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

    def replace_with_subquery(model_ref_name, _field):
        if model_ref_name == model_name:
            return f"({model.sql})"
        return f"${{ref({model_ref_name})}}"

    resolved_query = replace_refs(query_value, replace_with_subquery)

    # Use SQLGlot qualify to add subquery aliases
    try:
        sqlglot_dialect = get_sqlglot_dialect(source.get_dialect())
        parsed = parse_one(resolved_query, read=sqlglot_dialect)
        qualified = qualify.qualify(parsed, dialect=sqlglot_dialect)
        resolved_query = qualified.sql(dialect=sqlglot_dialect)
    except Exception:
        # If SQLGlot can't process it, use the original query
        pass

    # Execute query on source
    data = source.read_sql(resolved_query)

    # Convert to DataFrame
    df = pl.DataFrame(data)

    # Validate not empty
    if df.shape[0] == 0:
        raise ValueError(
            f"Input '{input_name}' query returned 0 rows. " f"Inputs must have at least one option."
        )

    # Ensure single column
    if df.shape[1] != 1:
        raise ValueError(
            f"Input '{input_name}' query must return exactly one column, "
            f"found {df.shape[1]} columns."
        )

    # Get values as list of strings
    first_col = df.columns[0]
    return df[first_col].cast(pl.Utf8).to_list()


def _execute_scalar_query(
    query_value: str,
    dag,
    input_name: str,
    field_name: str,
    output_dir: str,
) -> Any:
    """
    Execute a query that should return a single scalar value.

    Args:
        query_value: The query string (without ?{ } wrapper)
        dag: Project DAG
        input_name: Name of the input
        field_name: Name of the field (for error messages)
        output_dir: Output directory

    Returns:
        The scalar value from the query

    Raises:
        ValueError: If query returns multiple rows or columns
    """
    options = _execute_query_for_options(query_value, dag, input_name, output_dir)

    if len(options) > 1:
        raise ValueError(
            f"Input '{input_name}' {field_name} query returned {len(options)} values "
            f"but must return exactly one value."
        )

    return options[0] if options else None


def _resolve_value(value: Any, dag, input_name: str, field_name: str, output_dir: str) -> Any:
    """
    Resolve a value that could be static or query-based.

    Args:
        value: Static value or QueryString
        dag: Project DAG
        input_name: Name of the input
        field_name: Name of the field
        output_dir: Output directory

    Returns:
        Resolved value
    """
    if isinstance(value, QueryString):
        query_value = value.get_value()
        return _execute_scalar_query(query_value, dag, input_name, field_name, output_dir)
    return value


def _process_single_select(
    input_obj: SingleSelectInput,
    dag,
    output_dir: str,
) -> dict:
    """
    Process a single-select input and return JSON-serializable result.

    Args:
        input_obj: The SingleSelectInput object
        dag: Project DAG
        output_dir: Output directory

    Returns:
        Dict with results for JSON output
    """
    input_name = input_obj.name

    # Get options
    if isinstance(input_obj.options, QueryString):
        query_value = input_obj.options.get_value()
        options = _execute_query_for_options(query_value, dag, input_name, output_dir)
    else:
        options = [str(opt) for opt in input_obj.options]

    # Check option count limits
    option_count = len(options)
    warnings = []

    if option_count > OPTION_COUNT_ERROR_THRESHOLD:
        raise ValueError(
            f"Input '{input_name}' has {option_count:,} options, exceeding the "
            f"{OPTION_COUNT_ERROR_THRESHOLD:,} limit. Add WHERE clauses or use "
            f"aggregation to reduce the result set."
        )
    elif option_count > OPTION_COUNT_WARNING_THRESHOLD:
        warnings.append(
            f"Input '{input_name}' has {option_count:,} options. Consider adding filters "
            f"to reduce option count. Large option lists may cause slow dashboard loading."
        )

    # Get display configuration
    display_type = "dropdown"
    default_value = options[0] if options else None

    if input_obj.display:
        display_type = input_obj.display.type

        if input_obj.display.default:
            default_val = input_obj.display.default.value
            default_value = _resolve_value(
                default_val, dag, input_name, "default.value", output_dir
            )

    return {
        "options": options,
        "display": {
            "type": display_type,
            "default": {"value": default_value},
        },
        "warnings": warnings,
    }


def _process_multi_select(
    input_obj: MultiSelectInput,
    dag,
    output_dir: str,
) -> dict:
    """
    Process a multi-select input and return JSON-serializable result.

    Args:
        input_obj: The MultiSelectInput object
        dag: Project DAG
        output_dir: Output directory

    Returns:
        Dict with results for JSON output
    """
    input_name = input_obj.name
    warnings = []

    if input_obj.is_list_based():
        # List-based multi-select
        if isinstance(input_obj.options, QueryString):
            query_value = input_obj.options.get_value()
            options = _execute_query_for_options(query_value, dag, input_name, output_dir)
        else:
            options = [str(opt) for opt in input_obj.options]

        # Check option count limits
        option_count = len(options)
        if option_count > OPTION_COUNT_ERROR_THRESHOLD:
            raise ValueError(
                f"Input '{input_name}' has {option_count:,} options, exceeding the "
                f"{OPTION_COUNT_ERROR_THRESHOLD:,} limit."
            )
        elif option_count > OPTION_COUNT_WARNING_THRESHOLD:
            warnings.append(
                f"Input '{input_name}' has {option_count:,} options. Consider adding filters."
            )

        # Get display configuration
        display_type = "dropdown"
        default_values = "all"  # Default to all selected

        if input_obj.display:
            display_type = input_obj.display.type

            if input_obj.display.default and input_obj.display.default.values is not None:
                default_val = input_obj.display.default.values
                if isinstance(default_val, QueryString):
                    query_value = default_val.get_value()
                    default_values = _execute_query_for_options(
                        query_value, dag, input_name, output_dir
                    )
                elif default_val in ("all", "none"):
                    default_values = default_val
                else:
                    default_values = [str(v) for v in default_val]

        return {
            "structure": "options",
            "options": options,
            "display": {
                "type": display_type,
                "default": {"values": default_values},
            },
            "warnings": warnings,
        }

    else:
        # Range-based multi-select
        range_config = input_obj.range

        start = _resolve_value(range_config.start, dag, input_name, "range.start", output_dir)
        end = _resolve_value(range_config.end, dag, input_name, "range.end", output_dir)
        step = _resolve_value(range_config.step, dag, input_name, "range.step", output_dir)

        # Get display configuration
        display_type = "range-slider"
        default_start = start
        default_end = end

        if input_obj.display:
            display_type = input_obj.display.type

            if input_obj.display.default:
                if input_obj.display.default.start is not None:
                    default_start = _resolve_value(
                        input_obj.display.default.start,
                        dag,
                        input_name,
                        "default.start",
                        output_dir,
                    )
                if input_obj.display.default.end is not None:
                    default_end = _resolve_value(
                        input_obj.display.default.end,
                        dag,
                        input_name,
                        "default.end",
                        output_dir,
                    )

        return {
            "structure": "range",
            "range": {
                "start": start,
                "end": end,
                "step": step,
            },
            "display": {
                "type": display_type,
                "default": {
                    "start": default_start,
                    "end": default_end,
                },
            },
            "warnings": warnings,
        }


def action(
    input_obj: Union[SingleSelectInput, MultiSelectInput],
    dag,
    output_dir: str,
) -> JobResult:
    """
    Execute input job - compute options/range and store results as JSON.

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
        json_path = f"{inputs_directory}/{input_hash}.json"

        # Process based on input type
        if isinstance(input_obj, SingleSelectInput):
            results = _process_single_select(input_obj, dag, output_dir)
            input_type = "single-select"
            structure = "options"
        elif isinstance(input_obj, MultiSelectInput):
            results = _process_multi_select(input_obj, dag, output_dir)
            input_type = "multi-select"
            structure = results.get("structure", "options")
        else:
            raise ValueError(f"Unknown input type: {type(input_obj).__name__}")

        # Extract warnings from results
        warnings = results.pop("warnings", [])

        # Build JSON output
        json_output = {
            "input_name": input_name,
            "input_hash": input_hash,
            "type": input_type,
            "structure": structure,
            "results": results,
        }

        # Write JSON file
        with open(json_path, "w") as f:
            json.dump(json_output, f, indent=2, default=str)

        # Build success message
        if structure == "options":
            option_count = len(results.get("options", []))
            details = f"Computed {option_count} options for input \033[4m{input_name}\033[0m"
        else:
            details = f"Computed range for input \033[4m{input_name}\033[0m"

        success_message = format_message_success(
            details=details,
            start_time=start_time,
            full_path=json_path,
        )

        return JobResult(item=input_obj, success=True, message=success_message, warnings=warnings)

    except Exception as e:
        message = e.message if hasattr(e, "message") else str(e)
        failure_msg = format_message_failure(
            details=f"Failed to process input \033[4m{input_obj.name}\033[0m",
            start_time=start_time,
            full_path=None,
            error_msg=message,
        )
        return JobResult(item=input_obj, success=False, message=failure_msg)


def job(
    dag,
    output_dir: str,
    input_obj: Union[SingleSelectInput, MultiSelectInput],
) -> Job:
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

    # Determine if we need a source based on input configuration
    needs_source = False
    query_value = None

    if isinstance(input_obj, SingleSelectInput):
        if isinstance(input_obj.options, QueryString):
            needs_source = True
            query_value = input_obj.options.get_value()

    elif isinstance(input_obj, MultiSelectInput):
        if isinstance(input_obj.options, QueryString):
            needs_source = True
            query_value = input_obj.options.get_value()
        elif input_obj.range:
            # Check if any range values are query-based
            for field_name in ["start", "end", "step"]:
                field_value = getattr(input_obj.range, field_name)
                if isinstance(field_value, QueryString):
                    needs_source = True
                    query_value = field_value.get_value()
                    break

    # Get source if needed
    if needs_source and query_value:
        ref_names = extract_ref_names(query_value)
        if len(ref_names) > 0:
            model_name = list(ref_names)[0]
            try:
                model = dag.get_descendant_by_name(model_name)
                if isinstance(model, SqlModel):
                    source = get_source_for_model(model, dag, output_dir)
            except (ValueError, AttributeError):
                # If we can't find the model or source here, it will fail in action()
                pass

    return Job(
        item=input_obj,
        source=source,
        action=action,
        input_obj=input_obj,
        dag=dag,
        output_dir=output_dir,
    )
