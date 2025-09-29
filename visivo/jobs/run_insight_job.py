from visivo.logger.logger import Logger
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.model import Model
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.project import Project
from visivo.models.sources.source import Source
from visivo.models.insight import Insight
from visivo.query.insight_aggregator import InsightAggregator
from visivo.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
    start_message,
)
from time import time
from visivo.query.insight_tokenizer import InsightTokenizer
from visivo.jobs.utils import get_source_for_model


def action(insight, dag, output_dir):
    """Execute insight job - tokenize insight and generate insight.json file"""
    model = all_descendants_of_type(type=Model, dag=dag, from_node=insight)[0]
    source = get_source_for_model(model, dag, output_dir)

    insight_directory = f"{output_dir}/insights/{insight.name}"
    # Tokenize the insight to get pre-query and metadata
    tokenized_insight = _get_tokenized_insight(insight, dag, output_dir)
    try:
        start_time = time()

        # Execute the pre-query to get raw data
        flat_data = source.read_sql(tokenized_insight.pre_query)
        # Aggregate data into flat structure and generate insight.json
        InsightAggregator.aggregate_insight_data(
            data=flat_data, insight_dir=insight_directory, tokenized_insight=tokenized_insight
        )

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
            details=f"Failed query for insight \033[4m{insight.name}\033[0m",
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
