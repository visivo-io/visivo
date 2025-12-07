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
        from visivo.query.input_validator import (
            validate_insight_with_inputs,
            INPUT_PLACEHOLDER_PATTERN,
        )

        # Check if post_query has input placeholders
        has_placeholders = bool(re.search(INPUT_PLACEHOLDER_PATTERN, insight_query_info.post_query))

        if has_placeholders:
            try:
                # Validate query with all input combinations
                validate_insight_with_inputs(
                    insight=insight,
                    query=insight_query_info.post_query,
                    dag=dag,
                    output_dir=output_dir,
                    dialect=source.type,  # Use source dialect for validation
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
        failure_message = format_message_failure(
            details=f"Failed job for insight \033[4m{insight.name}\033[0m",
            start_time=start_time,
            full_path=None,
            error_msg=message,
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
