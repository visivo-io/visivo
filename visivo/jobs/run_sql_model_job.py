import os
from time import time
from visivo.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
)
from visivo.jobs.utils import get_source_for_model
from visivo.models.dag import all_descendants_of_type
from visivo.models.insight import Insight
from visivo.models.models.sql_model import SqlModel


def action(sql_model, dag, output_dir):
    """Execute the SQL model query and save result to parquet file.

    Args:
        sql_model: The SqlModel to execute
        dag: The project DAG
        output_dir: Directory to save output files

    Returns:
        JobResult indicating success or failure
    """
    source = get_source_for_model(sql_model, dag, output_dir)
    model_directory = f"{output_dir}/models/{sql_model.name}"

    try:
        start_time = time()

        # Execute the SQL query
        data = source.read_sql(sql_model.sql)

        # Save to parquet using polars
        import polars as pl

        df = pl.DataFrame(data)
        os.makedirs(model_directory, exist_ok=True)
        parquet_path = f"{model_directory}/data.parquet"
        df.write_parquet(parquet_path)

        success_message = format_message_success(
            details=f"Updated data for model \033[4m{sql_model.name}\033[0m",
            start_time=start_time,
            full_path=parquet_path,
        )
        return JobResult(item=sql_model, success=True, message=success_message)

    except Exception as e:
        if hasattr(e, "message"):
            message = e.message
        else:
            message = repr(e)
        failure_message = format_message_failure(
            details=f"Failed query for model \033[4m{sql_model.name}\033[0m",
            start_time=start_time,
            full_path=None,
            error_msg=message,
        )
        return JobResult(item=sql_model, success=False, message=failure_message)


def job(dag, output_dir: str, sql_model: SqlModel):
    """Create a Job for the SQL model if it's referenced by a dynamic insight.

    A job is only created if this SQL model is referenced by at least one insight
    that is_dynamic (has Input descendants).

    Args:
        dag: The project DAG
        output_dir: Directory to save output files
        sql_model: The SqlModel to potentially create a job for

    Returns:
        Job object if the model is referenced by a dynamic insight, None otherwise
    """
    # Find all insights in the project
    insights = all_descendants_of_type(type=Insight, dag=dag)

    # Check if any insight is dynamic and references this sql_model
    for insight in insights:
        if insight.is_dynamic(dag):
            # Check if this sql_model is in the insight's dependent models
            dependent_models = insight.get_all_dependent_models(dag)
            if sql_model in dependent_models:
                # This model is referenced by a dynamic insight, create a job
                source = get_source_for_model(sql_model, dag, output_dir)
                return Job(
                    item=sql_model,
                    source=source,
                    action=action,
                    sql_model=sql_model,
                    dag=dag,
                    output_dir=output_dir,
                )

    # Not referenced by any dynamic insight, no job needed
    return None
