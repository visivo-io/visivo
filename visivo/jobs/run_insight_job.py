from visivo.models.base.project_dag import ProjectDag
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.model import Model
from visivo.models.insight import Insight
from visivo.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
)
from visivo.logger.query_error_logger import log_failed_query, extract_error_location
from time import time
from visivo.jobs.utils import get_source_for_model
import json
import os


def action(insight: Insight, dag: ProjectDag, output_dir):
    """Execute insight job - tokenize insight and generate insight.json file"""
    model = all_descendants_of_type(type=Model, dag=dag, from_node=insight)[0]
    source = get_source_for_model(model, dag, output_dir)

    insight_query_info = insight.get_query_info(dag, output_dir)

    # Validate post_query with inputs if it has placeholders (Phase 3: SQLGlot validation)
    if insight_query_info.post_query:
        import re
        from visivo.query.input_validator import validate_insight_with_inputs
        from visivo.query.patterns import INPUT_FRONTEND_PATTERN

        # Check if post_query has input placeholders (frontend pattern: ${input.accessor})
        has_placeholders = bool(re.search(INPUT_FRONTEND_PATTERN, insight_query_info.post_query))

        if has_placeholders:
            try:
                # Validate query with all input combinations
                validate_insight_with_inputs(
                    insight=insight,
                    query=insight_query_info.post_query,
                    dag=dag,
                    output_dir=output_dir,
                    dialect=source.get_sqlglot_dialect(),  # Use source dialect for validation
                )
            except Exception as e:
                raise ValueError(
                    f"Input validation failed for insight '{insight.name}': {str(e)}"
                ) from e

    try:
        start_time = time()

        files_directory = f"{output_dir}/files"
        if insight_query_info.pre_query:
            import polars as pl

            data = source.read_sql(insight_query_info.pre_query)
            # Don't need to serialize for JSON since were writing to parquet now... although may get new errors... tbd... logic here was redundant with Aggregator anyways
            os.makedirs(files_directory, exist_ok=True)
            parquet_path = f"{files_directory}/{insight.name_hash()}.parquet"
            df = pl.DataFrame(data)
            df.write_parquet(parquet_path)
            files = [{"name_hash": insight.name_hash(), "signed_data_file_url": parquet_path}]
        else:
            models = insight.get_all_dependent_models(dag=dag)
            files = [
                {
                    "name_hash": model.name_hash(),
                    "signed_data_file_url": f"{files_directory}/{model.name_hash()}.parquet",
                }
                for model in models
                if os.path.exists(f"{files_directory}/{model.name_hash()}.parquet")
            ]

        # Store insight metadata with file references and post_query
        insight_data = {
            "name": insight.name,
            "files": files,
            "query": insight_query_info.post_query,
            "props_mapping": insight_query_info.props_mapping,
            "static_props": insight_query_info.static_props,  # Non-query props (e.g., marker.color)
            "split_key": insight_query_info.split_key,
            "type": insight.props.type.value,  # Trace type (bar, scatter, etc.)
        }

        insight_directory = f"{output_dir}/insights"
        insight_path = os.path.join(insight_directory, f"{insight.name_hash()}.json")
        os.makedirs(insight_directory, exist_ok=True)
        with open(insight_path, "w") as f:
            json.dump(insight_data, f, indent=2)

        success_message = format_message_success(
            details=f"Updated data for insight \033[4m{insight.name}\033[0m",
            start_time=start_time,
            full_path=None,
        )
        return JobResult(item=insight, success=True, message=success_message)

    except Exception as e:
        if hasattr(e, "message"):
            message = e.message
        else:
            message = repr(e)

        # Log failed query to file for debugging
        query_file = None
        if insight_query_info and insight_query_info.pre_query:
            error_location = extract_error_location(message)
            query_file = log_failed_query(
                output_dir=output_dir,
                item_name=insight.name,
                item_type="insight",
                query=insight_query_info.pre_query,
                error_msg=message,
                error_location=error_location,
            )

        # Format error with location and query file reference
        error_location = extract_error_location(message)
        error_display = message
        if error_location:
            error_display = f"{message}\n        at {error_location}"
        if query_file:
            error_display = f"{error_display}\n        query saved to: {query_file}"

        failure_message = format_message_failure(
            details=f"Failed job for insight \033[4m{insight.name}\033[0m",
            start_time=start_time,
            full_path=None,
            error_msg=error_display,
        )
        return JobResult(item=insight, success=False, message=failure_message)


def _get_source(insight, dag, output_dir):
    """Get the appropriate source for an insight"""
    model = all_descendants_of_type(type=Model, dag=dag, from_node=insight)[0]
    return get_source_for_model(model, dag, output_dir)


def job(dag, output_dir: str, insight: Insight):
    """Create insight job for execution in the DAG runner"""
    source = _get_source(insight, dag, output_dir)
    return Job(
        item=insight,
        source=source,
        action=action,
        insight=insight,
        dag=dag,
        output_dir=output_dir,
    )
