from visivo.logging.logger import Logger
from visivo.models.base.parent_model import ParentModel
from visivo.models.dag import all_descendants_of_type
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.project import Project
from visivo.query.jobs.job import (
    Job,
    JobResult,
    format_message_failure,
    format_message_success,
    start_message,
)
from time import time


def action(csv_script_model: CsvScriptModel, output_dir):
    Logger.instance().info(start_message("CsvScriptModel", csv_script_model))
    try:
        start_time = time()
        csv_script_model.insert_csv_to_sqlite(output_dir=output_dir)
        success_message = format_message_success(
            details=f"Updated data for model \033[4m{csv_script_model.name}\033[0m",
            start_time=start_time,
            full_path=csv_script_model.get_sqlite_source(
                output_dir=output_dir
            ).database,
        )
        return JobResult(success=True, message=success_message)
    except Exception as e:
        failure_message = format_message_failure(
            details=f"Failed query for model \033[4m{csv_script_model.name}\033[0m",
            start_time=start_time,
            full_path=csv_script_model.get_sqlite_source(
                output_dir=output_dir
            ).database,
            error_msg=str(repr(e)),
        )
        return JobResult(success=False, message=failure_message)


def jobs(dag, output_dir: str, project: Project, name_filter: str):
    csv_script_models = all_descendants_of_type(
        type=CsvScriptModel, dag=dag, from_node=project
    )

    if name_filter:
        included_nodes = project.nodes_including_named_node_in_graph(name=name_filter)
    else:
        included_nodes = project.descendants()
    csv_script_models = set(csv_script_models).intersection(included_nodes)

    jobs = []
    for csv_script_model in csv_script_models:
        jobs.append(
            Job(
                item=csv_script_model,
                source=csv_script_model.get_sqlite_source(output_dir),
                action=action,
                csv_script_model=csv_script_model,
                output_dir=output_dir,
            )
        )
    return jobs
