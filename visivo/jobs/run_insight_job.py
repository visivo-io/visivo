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
from visivo.query.insight_tokenizer import InsightTokenizer
from visivo.jobs.utils import get_source_for_model
import json
import os
from decimal import Decimal
from datetime import date, datetime


def _convert_to_json_serializable(data):
    """Convert data to JSON serializable format"""
    if isinstance(data, list):
        return [{k: _convert_value(v) for k, v in row.items()} for row in data]
    return data


def _convert_value(value):
    """Convert individual values to JSON serializable types"""
    if isinstance(value, Decimal):
        return float(value)
    elif isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def action(insight: Insight, dag: ProjectDag, output_dir):
    """Execute insight job - tokenize insight and generate insight.json file"""
    model = all_descendants_of_type(type=Model, dag=dag, from_node=insight)[0]
    source = get_source_for_model(model, dag, output_dir)

    tokenized_insight = _get_tokenized_insight(insight, dag, output_dir)
    try:
        start_time = time()

        files_directory = f"{output_dir}/files"
        if tokenized_insight.pre_query:
            data = source.read_sql(tokenized_insight.pre_query)
            import polars as pl

            df = pl.DataFrame(_convert_to_json_serializable(data))
            os.makedirs(files_directory, exist_ok=True)
            parquet_path = f"{files_directory}/{insight.name_hash()}.parquet"
            df.write_parquet(parquet_path)
            files = [parquet_path]
        else:
            models = insight.get_all_dependent_models(dag=dag)
            files = [f"{files_directory}/{model.name_hash()}.parquet" for model in models]
            files = [f for f in files if os.path.exists(f)]

        # Store insight metadata with file references and post_query
        insight_data = {"files": files, "query": tokenized_insight.post_query, "props_mapping": {}}

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


def _get_tokenized_insight(insight, dag, output_dir):
    """Get tokenized insight with pre/post queries"""
    model = all_descendants_of_type(type=Model, dag=dag, from_node=insight)[0]
    source = get_source_for_model(model, dag, output_dir)
    return InsightTokenizer(insight=insight, source=source, model=model, dag=dag).tokenize()


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
