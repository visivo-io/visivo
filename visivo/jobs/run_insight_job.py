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


def action(insight, dag, output_dir):
    """Execute insight job - tokenize insight and generate insight.json file"""
    Logger.instance().info(start_message("Insight", insight))
    model = all_descendants_of_type(type=Model, dag=dag, from_node=insight)[0]

    # Get appropriate source for the model type
    if isinstance(model, CsvScriptModel):
        source = model.get_duckdb_source(output_dir=output_dir)
    elif isinstance(model, LocalMergeModel):
        source = model.get_duckdb_source(output_dir=output_dir, dag=dag)
    else:
        source = all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]

    insight_directory = f"{output_dir}/insights/{insight.name}"
    
    try:
        start_time = time()
        
        # Tokenize the insight to get pre-query and metadata
        tokenized_insight = InsightTokenizer(
            insight=insight, model=model, source=source
        ).tokenize()
        
        # Execute the pre-query to get raw data
        pre_query = tokenized_insight.pre_query
        data = source.read_sql(pre_query)
        
        # Aggregate data into flat structure and generate insight.json
        InsightAggregator.aggregate_insight_data(
            data=data, 
            insight_dir=insight_directory, 
            tokenized_insight=tokenized_insight
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
    
    if isinstance(model, CsvScriptModel):
        source = model.get_duckdb_source(output_dir=output_dir)
    elif isinstance(model, LocalMergeModel):
        source = model.get_duckdb_source(output_dir=output_dir, dag=dag)
    else:
        source = all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]
    
    return InsightTokenizer(insight=insight, model=model, source=source).tokenize()


def _get_source(insight, dag, output_dir):
    """Get the appropriate source for an insight"""
    sources = all_descendants_of_type(type=Source, dag=dag, from_node=insight)
    if len(sources) == 1:
        return sources[0]

    model = all_descendants_of_type(type=Model, dag=dag, from_node=insight)[0]
    if isinstance(model, CsvScriptModel):
        return model.get_duckdb_source(output_dir)
    elif isinstance(model, LocalMergeModel):
        return model.get_duckdb_source(output_dir, dag)
    else:
        return model.source


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