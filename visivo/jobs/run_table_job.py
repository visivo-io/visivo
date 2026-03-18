from visivo.models.table import Table
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
from visivo.constants import DEFAULT_RUN_ID
import json
import os


def action(table: Table, dag, output_dir, run_id=DEFAULT_RUN_ID):
    run_output_dir = f"{output_dir}/{run_id}"
    files_directory = f"{run_output_dir}/files"
    insights_directory = f"{run_output_dir}/insights"

    try:
        start_time = time()

        models = all_descendants_of_type(type=Model, dag=dag, from_node=table)
        model = models[0] if models else None

        if not model:
            raise ValueError(f"No model found for table '{table.name}'")

        parquet_path = f"{files_directory}/{model.name_hash()}.parquet"
        if not os.path.exists(parquet_path):
            raise ValueError(f"Parquet file not found for model '{model.name}' at {parquet_path}")

        files = [
            {
                "name_hash": model.name_hash(),
                "signed_data_file_url": parquet_path,
            }
        ]

        table_data = {
            "name": model.name,
            "files": files,
            "query": f'SELECT * FROM "{model.name_hash()}"',
            "props_mapping": {},
            "static_props": {},
            "split_key": None,
            "type": "table",
        }

        os.makedirs(insights_directory, exist_ok=True)
        insight_path = os.path.join(insights_directory, f"{model.name_hash()}.json")
        with open(insight_path, "w") as f:
            json.dump(table_data, f, indent=2)

        success_message = format_message_success(
            details=f"Updated data for table \033[4m{table.name}\033[0m",
            start_time=start_time,
            full_path=None,
        )
        return JobResult(item=table, success=True, message=success_message)

    except Exception as e:
        message = repr(e)
        failure_message = format_message_failure(
            details=f"Failed job for table \033[4m{table.name}\033[0m",
            start_time=start_time,
            full_path=None,
            error_msg=message,
        )
        return JobResult(item=table, success=False, message=failure_message)


def _table_needs_model_job(table: Table) -> bool:
    if table.data and not Insight.is_ref(table.data) and not isinstance(table.data, Insight):
        return True
    return False


def job(dag, output_dir: str, table: Table, run_id: str = None):
    kwargs = {
        "table": table,
        "dag": dag,
        "output_dir": output_dir,
    }
    if run_id is not None:
        kwargs["run_id"] = run_id

    return Job(item=table, source=None, action=action, **kwargs)
