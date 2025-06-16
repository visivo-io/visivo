from visivo.logging.logger import Logger
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.model import Model
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.models.sources.source import Source
from visivo.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
    start_message,
)
from time import time
import os
import json

def action(model, dag, output_dir):
    Logger.instance().info(start_message("Model", model))

    # Determine the source and SQL for the model
    if isinstance(model, CsvScriptModel):
        source = model.get_duckdb_source(output_dir=output_dir)
        sql = model.sql
    elif isinstance(model, LocalMergeModel):
        # Ensure dependent models are inserted
        model.insert_duckdb_data(output_dir=output_dir, dag=dag)
        source = model.get_duckdb_source(output_dir=output_dir, dag=dag)
        sql = model.sql
    elif isinstance(model, SqlModel):
        if model.source:
            # Dereference the source if needed
            if isinstance(model.source, str):
                source = all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]
            else:
                source = model.source
        else:
            source = all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]
        sql = model.sql
    else:
        # Fallback for generic Model
        source = all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]
        sql = getattr(model, 'sql', None)
        if not sql:
            raise ValueError(f"Model {model.name} does not have a SQL statement.")

    model_directory = f"{output_dir}/models/{model.name}"
    os.makedirs(model_directory, exist_ok=True)
    data_file = f"{model_directory}/data.json"
    try:
        start_time = time()
        data_frame = source.read_sql(sql)
        # Save as JSON
        with open(data_file, "w") as f:
            json.dump({
                "columns": list(data_frame.columns),
                "rows": data_frame.to_dict("records")
            }, f, default=str)
        success_message = format_message_success(
            details=f"Updated data for model \033[4m{model.name}\033[0m",
            start_time=start_time,
            full_path=data_file,
        )
        return JobResult(item=model, success=True, message=success_message)
    except Exception as e:
        if hasattr(e, "message"):
            message = e.message
        else:
            message = repr(e)
        failure_message = format_message_failure(
            details=f"Failed query for model \033[4m{model.name}\033[0m",
            start_time=start_time,
            full_path=data_file,
            error_msg=message,
        )
        return JobResult(item=model, success=False, message=failure_message)

def job(dag, output_dir: str, model: Model):
    # Find the source for the model
    if isinstance(model, CsvScriptModel):
        source = model.get_duckdb_source(output_dir=output_dir)
    elif isinstance(model, LocalMergeModel):
        source = model.get_duckdb_source(output_dir=output_dir, dag=dag)
    elif isinstance(model, SqlModel):
        if model.source:
            if isinstance(model.source, str):
                source = all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]
            else:
                source = model.source
        else:
            source = all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]
    else:
        source = all_descendants_of_type(type=Source, dag=dag, from_node=model)[0]
    return Job(
        item=model,
        source=source,
        action=action,
        model=model,
        dag=dag,
        output_dir=output_dir,
    ) 