from visivo.logging.logger import Logger
from visivo.models.models.model import Model
from visivo.models.sources.source import Source
from visivo.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
    start_message,
)
from time import time
import json
import io
import os

MAX_EXCEL_ROWS = 1048576


def action(model: Model, dag, output_dir):
    Logger.instance().info(start_message("Model", model))
    # Get the source associated with this model
    from visivo.models.dag import all_descendants_of_type
    source: Source = all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]
    model_directory = f"{output_dir}/models/{model.name}"
    query_string = model.sql
    try:
        start_time = time()
        data_frame = source.read_sql(query_string)
        if data_frame.height > MAX_EXCEL_ROWS:
            raise Exception(
                f"Query returned {data_frame.height} rows, exceeding the limit of {MAX_EXCEL_ROWS} rows for table data."
            )
        os.makedirs(model_directory, exist_ok=True)
        buf = io.StringIO()
        data_frame.write_json(buf)
        buf.seek(0)
        rows = json.load(buf)
        with open(f"{model_directory}/data.json", "w") as fp:
            json.dump(rows, fp)
        success_message = format_message_success(
            details=f"Updated data for model \033[4m{model.name}\033[0m",
            start_time=start_time,
            full_path=None,
        )
        return JobResult(item=model, success=True, message=success_message)
    except Exception as e:
        message = e.message if hasattr(e, "message") else repr(e)
        failure_message = format_message_failure(
            details=f"Failed query for model \033[4m{model.name}\033[0m",
            start_time=start_time,
            full_path=None,
            error_msg=message,
        )
        return JobResult(item=model, success=False, message=failure_message)


def job(dag, output_dir: str, model: Model):
    source = list(model.child_items())[0] if hasattr(model, "child_items") else None
    if source is None:
        from visivo.models.dag import all_descendants_of_type
        source = all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]
    return Job(
        item=model,
        source=source,
        action=action,
        model=model,
        dag=dag,
        output_dir=output_dir,
    )
